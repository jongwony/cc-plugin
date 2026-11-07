const app = await cua.getApp("com.apple.findmy", { initialState: false });
const st = await app.getAXState({ emit: false, includeScreenshot: false });
const text = String(typeof st === "string" ? st : (st.text ?? st.state ?? JSON.stringify(st)));
nodeRepl.write(JSON.stringify(text.split(/\\n|\n/).filter(l => l.includes(" ID: ListEntityRow")).map(l => l.trim())));
