import { detectLang, setLang } from "../i18n/index.js";
import { App } from "./app.js";
import { Session } from "./session.js";

const session = new Session();
const lang = session.profile.lang ?? detectLang(navigator.languages ?? [navigator.language]);
setLang(lang);
document.documentElement.lang = lang;

const app = new App(session);
app.start();

// Debug and test hook: ?debug exposes the game for the end-to-end tests.
if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as Record<string, unknown>).__game = { app, session, get state() { return session.state; } };
