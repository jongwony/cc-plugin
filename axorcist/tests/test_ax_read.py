import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/ax_read.py'
spec = importlib.util.spec_from_file_location('ax_read', SCRIPT)
ax = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ax)

C = {'application':'local.test.fixture', 'filter':{'AXRole':'AXStaticText'},
     'targets':[{'key':'alpha', 'match':{'AXIdentifier':{'equals':'alpha'}},
                 'attributes':['AXValue'], 'expected':{'AXValue':'A'}}]}


def node(identifier='alpha', value='A'):
    return {'attributes':{k:{'any_value':v} for k,v in {'AXRole':'AXStaticText', 'AXIdentifier':identifier, 'AXValue':value}.items()}}


def fake_lsappinfo(root, instances=1, pid=4242):
    path=root/'lsappinfo'
    asns=['ASN:0x0-0x%x-"Fixture App":'%(0x1000+i) for i in range(instances)]
    path.write_text('#!'+sys.executable+'\nimport sys\na=sys.argv[1:]\n'
        'if a[:1]==["find"]:\n    assert a[1]=="bundleid=local.test.fixture",a\n    print('+repr('\n'.join(asns))+' if '+repr(instances)+' else "")\n'
        'elif a[:3]==["info","-only","pid"]:\n    print("[ NULL ]  [ NULL ]  \\n    bundleID=[ NULL ] \\n    pid = '+str(pid)+' !cgsConnection !signalled type=[ NULL ]")\n'
        'else:\n    sys.exit(2)\n')
    path.chmod(0o755)
    return path


def response(*nodes):
    return {'status':'success','data':{'count':len(nodes),'elements':list(nodes)}}


class Reads(unittest.TestCase):
    def check(self, obj, **kwargs):
        return ax.validate(copy.deepcopy(C), obj, **kwargs)

    def test_single_scoped_observation_is_not_complete_or_fresh(self):
        r=self.check(response(node()))
        self.assertEqual(r['status'],'observed')
        self.assertEqual(r['source_completeness'],'unproven')
        self.assertEqual(r['service_freshness'],'not_checked')
        self.assertEqual(r['targets'][0]['accuracy'],'matches_expected')
        self.assertNotIn('values',r['targets'][0])

    def test_duplicate_identical_values_not_collapsed(self):
        r=self.check(response(node(),node()))
        self.assertEqual(r['status'],'rejected')
        self.assertEqual(r['targets'][0]['cardinality'],'duplicate')
        self.assertEqual(r['targets'][0]['matches'],2)

    def test_missing_not_app_absence(self):
        r=self.check(response(node('beta')))
        self.assertEqual(r['targets'][0]['cardinality'],'not_returned')
        self.assertEqual(r['source_completeness'],'unproven')

    def test_wrong_value_distinct_from_missing(self):
        r=self.check(response(node(value='wrong')))
        self.assertEqual(r['targets'][0]['cardinality'],'single')
        self.assertEqual(r['targets'][0]['accuracy'],'mismatch')
        self.assertEqual(r['status'],'rejected')

    def test_no_oracle_not_accuracy_claim(self):
        c=copy.deepcopy(C);del c['targets'][0]['expected']
        r=ax.validate(c,response(node()))
        self.assertEqual(r['targets'][0]['accuracy'],'not_checked')

    def test_empty_value_preserved(self):
        c=copy.deepcopy(C);c['targets'][0]['expected']['AXValue']=''
        r=ax.validate(c,response(node(value='')),include_values=True)
        self.assertEqual(r['status'],'observed');self.assertEqual(r['targets'][0]['values']['AXValue'],'')

    def test_unknown_candidate_prevents_single(self):
        n=node();del n['attributes']['AXIdentifier']
        r=self.check(response(node(),n))
        self.assertEqual(r['targets'][0]['cardinality'],'indeterminate')
        self.assertEqual(r['status'],'rejected')

    def test_known_exclusion_with_unknown_other_predicate(self):
        c=copy.deepcopy(C);c['targets'][0]['match']['AXTitle']={'equals':'target'}
        n=node('beta');target=node();target['attributes']['AXTitle']='target'
        r=ax.validate(c,response(n,target));self.assertEqual(r['status'],'observed')

    def test_missing_or_nonstring_required_attribute(self):
        for value in [None,False,{},1]:
            r=self.check(response(node(value=value)))
            self.assertEqual(r['targets'][0]['attributes'],'missing')
            self.assertEqual(r['status'],'rejected')

    def test_overlapping_targets_rejected(self):
        c=copy.deepcopy(C);t=copy.deepcopy(c['targets'][0]);t['key']='beta';c['targets'].append(t)
        r=ax.validate(c,response(node()))
        self.assertEqual(r['status'],'rejected');self.assertTrue(all(t['overlaps_target'] for t in r['targets']))

    def test_count_and_shapes_fail_closed(self):
        for r in [[],{}, {'status':'success','data':[]}, {'status':'success','data':{'count':True,'elements':[node()]}},response(None)]:
            self.assertEqual(self.check(r)['status'],'rejected')
        r=response(node());r['data']['count']=2
        self.assertEqual(self.check(r)['reason'],'invalid_collection')

    def test_filter_is_revalidated(self):
        n=node();n['attributes']['AXRole']='AXButton'
        self.assertEqual(self.check(response(n))['reason'],'filter_unverified')

    def test_error_rejects_even_matching_rows(self):
        self.assertEqual(self.check(response(node()),exit_code=1)['reason'],'source_error')
        r=response(node());r['status']='error'
        self.assertEqual(self.check(r)['reason'],'source_error')

    def test_success_with_timeout_warning_is_not_success(self):
        r=response(node());r['debug_logs']=['[2026-11-06T00:00:00.123Z] [WARNING] - HandleCollectAll: traversal timeout (20.0s) reached. Aborting traversal.']
        self.assertEqual(self.check(r)['reason'],'source_diagnostic')
        self.assertEqual(self.check(response(node()),stderr='unexpected diagnostic')['status'],'rejected')

    def test_error_and_critical_levels_rejected(self):
        for level in ['ERROR','CRITICAL']:
            r=response(node());r['debug_logs']=['[2026-11-06T00:00:00Z] [%s] - collection failed' % level]
            self.assertEqual(self.check(r)['reason'],'source_diagnostic')

    def test_unparseable_log_line_rejected(self):
        for line in ['[INFO] Collected 1 elements','Collected 1 elements','[2026-11-06T00:00:00Z] [info] - x']:
            r=response(node());r['debug_logs']=[line]
            self.assertEqual(self.check(r)['reason'],'source_diagnostic')

    def test_info_message_text_does_not_classify(self):
        c=copy.deepcopy(C);c['application']='local.test.errorviewer'
        r=response(node());r['debug_logs']=["[2026-11-06T00:00:00.5Z] [INFO] [AXorcist.swift:159] - HandleCollectAll: Starting collection for app 'local.test.errorviewer' timeout truncated warning"]
        self.assertEqual(ax.validate(c,r)['status'],'observed')

    def test_normal_debug_stderr_accepted_but_unknown_rejected(self):
        r=response(node());r['debug_logs']=['[2026-11-06T00:00:00Z] [INFO] - Collected 1 elements']
        stderr='AXORCMain.run: AXorc version 0.2.3 build 2611060511, Detail level: normal.\n\n--- Debug Logs (axorc run end) ---\n'+r['debug_logs'][0]+'\n--- End Debug Logs ---\n'
        self.assertEqual(self.check(r,stderr=stderr)['status'],'observed')
        self.assertEqual(self.check(r,stderr=stderr+'unrecognized warning')['status'],'rejected')

    def test_banner_with_injected_text_rejected(self):
        for banner in ['AXORCMain.run: AXorc version 0.2.3 build abc WARNING: traversal timed out | Detail level: normal.',
                       'AXORCMain.run: AXorc version 0.2.3 build 2611060511 WARNING, Detail level: normal.',
                       'AXORCMain.run: AXorc version 0.2.3 build 2611060511, Detail level: normal. timeout']:
            self.assertEqual(self.check(response(node()),stderr=banner)['reason'],'source_diagnostic')

    def test_case_and_unicode_are_exact(self):
        for identity in ['ALPHA','alpha ','αlpha']:
            self.assertEqual(self.check(response(node(identity)))['targets'][0]['cardinality'],'not_returned')

    def test_prefix_predicate_does_not_mean_exact_filter(self):
        c=copy.deepcopy(C);c['targets'][0]['match']['AXIdentifier']={'prefix':'alpha,'}
        r=ax.validate(c,response(node('alpha,location'),node('alphabet,location')))
        self.assertEqual(r['status'],'observed')

    def test_kakao_and_invalid_contracts_reject(self):
        mutations=[('application','com.kakao.KakaoTalkMac'),('application','focused'),('max_depth',True),('filter',{}),('targets',[]),('command','perform')]
        for k,v in mutations:
            c=copy.deepcopy(C);c[k]=v
            with self.assertRaises(ax.Invalid):ax.contract_check(c)
        c=copy.deepcopy(C);c['targets'][0]['expected']['AXTitle']='x'
        with self.assertRaises(ax.Invalid):ax.contract_check(c)

    def test_command_is_read_only_and_requests_validation_attributes(self):
        cmd=ax.command(C,4242)
        self.assertEqual(cmd['command'],'collectAll')
        self.assertEqual(cmd['pid'],4242);self.assertNotIn('application',cmd)
        self.assertEqual(cmd['attributes'],['AXIdentifier','AXRole','AXValue'])

    def test_private_values_and_source_errors_not_in_default_output(self):
        secret='private-location'
        r=self.check(response(node(value=secret)))
        self.assertNotIn(secret,json.dumps(r))
        r=self.check({'status':'error','message':secret})
        self.assertNotIn(secret,json.dumps(r))

    def test_include_values_never_serializes_invalid_nested_payload(self):
        payload={'unexpected_child':{'unrequested_text':'SYNTHETIC_PRIVATE'}}
        r=self.check(response(node(value=payload)),include_values=True)
        self.assertEqual(r['status'],'rejected')
        self.assertIsNone(r['targets'][0]['values']['AXValue'])
        self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(r))

    def test_duplicate_json_keys_and_nonfinite_rejected(self):
        for text in ['{"a":1,"a":2}','{"x":NaN}']:
            with self.assertRaises(ax.Invalid):ax.load_json(text)

    def test_cli_fake_process_success_error_and_timeout(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);contract=root/'contract.json';contract.write_text(json.dumps(C))
            fake=root/'axorc';fake.write_text('#!'+sys.executable+'\nimport json,sys\nassert sys.argv[1:4]==["raw","--debug","--json"]\nq=json.loads(sys.argv[4])\nassert q["pid"]==4242 and "application" not in q,q\nprint('+repr(json.dumps(response(node())))+')\n');fake.chmod(0o755)
            cmd=[sys.executable,str(SCRIPT),'--contract',str(contract),'--lsappinfo',str(fake_lsappinfo(root)),'--axorc',str(fake)]
            p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stdout)
            self.assertEqual(json.loads(p.stdout)['status'],'observed')
            fake.write_text('#!'+sys.executable+'\nimport time\ntime.sleep(2)\n')
            p=subprocess.run(cmd+['--timeout','.05'],capture_output=True,text=True)
            self.assertEqual(p.returncode,1);self.assertEqual(json.loads(p.stdout)['reason'],'process_timeout')
            contract.write_text('{broken')
            p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,1)
            self.assertNotIn('Traceback',p.stderr)
            for depth in (2000, 200000):
                contract.write_text('['*depth+']'*depth)
                p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,1)
                self.assertNotIn('Traceback',p.stderr)
                self.assertEqual(json.loads(p.stdout)['reason'],'invalid_input_or_execution')
            contract.write_text(json.dumps(C))
            nested='['*200000+']'*200000
            fake.write_text('#!'+sys.executable+'\nimport sys\nsys.stdout.write('+repr(nested)+')\n')
            p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,1)
            self.assertNotIn('Traceback',p.stderr)
            self.assertEqual(json.loads(p.stdout)['reason'],'invalid_input_or_execution')


    def test_every_exit_path_carries_one_envelope(self):
        keys={'status','coverage','source_completeness','service_freshness','targets','reason'}
        early=[self.check({'status':'error'}),self.check({'status':'success','debug_logs':[1]}),
               self.check(response(node()),stderr='unexpected'),self.check({'status':'success','data':[]}),
               self.check(response(None))]
        n=node();n['attributes']['AXRole']='AXButton';early.append(self.check(response(n)))
        early.append(self.check(response(node())))
        for r in early:self.assertTrue(keys<=set(r),r)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);contract=root/'contract.json';contract.write_text(json.dumps(C))
            fake=root/'axorc';fake.write_text('#!'+sys.executable+'\nimport time\ntime.sleep(2)\n');fake.chmod(0o755)
            cmd=[sys.executable,str(SCRIPT),'--contract',str(contract),'--lsappinfo',str(fake_lsappinfo(root)),'--axorc',str(fake)]
            outs=[json.loads(subprocess.run(cmd+['--timeout','.05'],capture_output=True,text=True).stdout),
                  json.loads(subprocess.run(cmd[:-1]+[str(root/'missing')],capture_output=True,text=True).stdout)]
            contract.write_text('{broken')
            outs.append(json.loads(subprocess.run(cmd,capture_output=True,text=True).stdout))
        self.assertEqual([o['reason'] for o in outs],['process_timeout','invalid_input_or_execution','invalid_input_or_execution'])
        for o in outs:
            self.assertTrue(keys<=set(o),o);self.assertEqual(o['status'],'rejected');self.assertEqual(o['targets'],[])

    def test_app_resolution_pins_one_running_instance(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);contract=root/'contract.json';contract.write_text(json.dumps(C))
            marker=root/'axorc-ran'
            fake=root/'axorc';fake.write_text('#!'+sys.executable+'\nopen('+repr(str(marker))+',"w").close()\nprint('+repr(json.dumps(response(node())))+')\n');fake.chmod(0o755)
            for n,reason in [(0,'app_not_running'),(2,'app_ambiguous')]:
                lsa=root/('lsa%d'%n);fake_lsappinfo(root,n).rename(lsa)
                p=subprocess.run([sys.executable,str(SCRIPT),'--contract',str(contract),'--lsappinfo',str(lsa),'--axorc',str(fake)],capture_output=True,text=True)
                o=json.loads(p.stdout);self.assertEqual((p.returncode,o['reason'],o['status']),(1,reason,'rejected'))
                self.assertFalse(marker.exists())
            bad=root/'lsabad';bad.write_text('#!'+sys.executable+'\nprint("unexpected")\n');bad.chmod(0o755)
            p=subprocess.run([sys.executable,str(SCRIPT),'--contract',str(contract),'--lsappinfo',str(bad),'--axorc',str(fake)],capture_output=True,text=True)
            self.assertEqual(json.loads(p.stdout)['reason'],'invalid_input_or_execution');self.assertFalse(marker.exists())
            p=subprocess.run([sys.executable,str(SCRIPT),'--contract',str(contract),'--lsappinfo',str(fake_lsappinfo(root,1)),'--axorc',str(fake)],capture_output=True,text=True)
            self.assertEqual(json.loads(p.stdout)['status'],'observed');self.assertTrue(marker.exists())

    def test_multiline_log_entry_is_one_benign_entry(self):
        r=response(node());entry='[2026-11-06T00:00:00.000Z] [INFO] - Root title Fixture\nWorkspace'
        r['debug_logs']=[entry]
        stderr='AXORCMain.run: AXorc version 0.2.3 build 2611060511, Detail level: normal.\n--- Debug Logs (axorc run end) ---\n'+entry+'\n--- End Debug Logs ---\n'
        self.assertEqual(self.check(r,stderr=stderr)['status'],'observed')
        self.assertEqual(self.check(r,stderr=stderr+'Workspace\n')['reason'],'source_diagnostic')

if __name__=='__main__':unittest.main()
