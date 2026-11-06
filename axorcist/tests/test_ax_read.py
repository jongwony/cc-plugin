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
        r=response(node());r['debug_logs']=['[WARNING] HandleCollectAll: traversal timeout reached']
        self.assertEqual(self.check(r)['reason'],'source_diagnostic')
        self.assertEqual(self.check(response(node()),stderr='unexpected diagnostic')['status'],'rejected')

    def test_normal_debug_stderr_accepted_but_unknown_rejected(self):
        r=response(node());r['debug_logs']=['[2026-11-06T00:00:00Z] [INFO] - Collected 1 elements']
        stderr='AXORCMain.run: AXorc version 0.2.3 build abc | Detail level: normal.\n\n--- Debug Logs (axorc run end) ---\n'+r['debug_logs'][0]+'\n--- End Debug Logs ---\n'
        self.assertEqual(self.check(r,stderr=stderr)['status'],'observed')
        self.assertEqual(self.check(r,stderr=stderr+'unrecognized warning')['status'],'rejected')

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
        cmd=ax.command(C)
        self.assertEqual(cmd['command'],'collectAll')
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
            fake=root/'axorc';fake.write_text('#!'+sys.executable+'\nimport json,sys\nassert sys.argv[1:4]==["raw","--debug","--json"]\nprint('+repr(json.dumps(response(node())))+')\n');fake.chmod(0o755)
            cmd=[sys.executable,str(SCRIPT),'--contract',str(contract),'--axorc',str(fake)]
            p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stdout)
            self.assertEqual(json.loads(p.stdout)['status'],'observed')
            fake.write_text('#!'+sys.executable+'\nimport time\ntime.sleep(2)\n')
            p=subprocess.run(cmd+['--timeout','.05'],capture_output=True,text=True)
            self.assertEqual(p.returncode,1);self.assertEqual(json.loads(p.stdout)['reason'],'process_timeout')
            contract.write_text('{broken')
            p=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(p.returncode,1)
            self.assertNotIn('Traceback',p.stderr)


if __name__=='__main__':unittest.main()
