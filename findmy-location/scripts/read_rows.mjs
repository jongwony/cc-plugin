const app = await cua.getApp("com.apple.findmy", { initialState: false });
const st = await app.getAXState({ emit: false, includeScreenshot: false });
const payload = typeof st === "string"
  ? st.split("\n").filter(l => l.includes(" ID: ListEntityRow")).map(l => l.trim())
  : { error: "getAXState returned " + typeof st + ", not text" };
nodeRepl.write("\nFINDMY_ROWS " + JSON.stringify(payload) + "\n");
