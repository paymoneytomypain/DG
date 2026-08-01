const FALLBACK_LANG = "ja_JP";

// URLパラメータ・ブラウザ言語設定 → Language.xmlのキーへのマッピング
// 例: ?lang=ja / ?lang=ja_JP / ?lang=ja-JP / ?lang=JA_JP のいずれも "ja_JP" に正規化される
const LANG_ALIAS_MAP = {
  "en":    "en_US", "en_US": "en_US", "en_GB": "en_US",
  "ja":    "ja_JP", "ja_JP": "ja_JP",
  "zh_TW": "zh_CHT", "zh_HK": "zh_CHT", "zh_HANT": "zh_CHT", "zh_CHT": "zh_CHT",
  "zh_CN": "zh_CHS", "zh":    "zh_CHS", "zh_HANS": "zh_CHS", "zh_CHS": "zh_CHS",
  "ko":    "ko_KR", "ko_KR": "ko_KR"
};

// { [メッセージキー]: { [言語コード]: html文字列 } }
let languageData = {};

/**
 * 言語コード文字列(表記ゆれ・大文字小文字を問わない)を Language.xml のキーへ正規化する。
 * マッピングに存在しない場合は null を返す。
 */
function resolveLangKey(raw) {
  if (!raw) return null;
  const normalized = raw.trim().replace("-", "_").toUpperCase();

  // 完全一致（大文字小文字を無視して比較）
  const exactMatch = Object.keys(LANG_ALIAS_MAP).find(k => k.toUpperCase() === normalized);
  if (exactMatch) return LANG_ALIAS_MAP[exactMatch];

  // 主言語部分のみでの一致（例: "ja_XX" -> "ja"）
  const primary = normalized.split("_")[0];
  const primaryMatch = Object.keys(LANG_ALIAS_MAP).find(k => k.toUpperCase() === primary);
  if (primaryMatch) return LANG_ALIAS_MAP[primaryMatch];

  return null;
}

/**
 * 言語の決定順序:
 *   1. URLクエリパラメータ ?lang=xxx
 *   2. ブラウザの言語設定 (navigator.language)
 *   3. 既定言語 (ja_JP)
 */
function detectLang() {
  const params = new URLSearchParams(window.location.search);
  const queryLang = params.get("lang");
  const fromQuery = resolveLangKey(queryLang);
  if (fromQuery) {
    console.log(`言語をURLパラメータから決定: lang=${queryLang} -> ${fromQuery}`);
    return fromQuery;
  }
  if (queryLang) {
    console.warn(`URLパラメータ lang=${queryLang} はマッピングに存在しないため無視します`);
  }

  const fromBrowser = resolveLangKey(navigator.language);
  if (fromBrowser) {
    console.log(`言語をブラウザ設定から決定: navigator.language=${navigator.language} -> ${fromBrowser}`);
    return fromBrowser;
  }

  console.log(`言語を既定値にフォールバック: ${FALLBACK_LANG}`);
  return FALLBACK_LANG;
}

/**
 * Language.xml を読み込み、すべての <message> を languageData に格納する。
 * (ページごとに使用するキーが異なっても、同じ script.js を使い回せるようにするため)
 */
async function loadLanguages() {
  const res = await fetch("Language.xml");
  if (!res.ok) {
    throw new Error(`Language.xml の取得に失敗しました: HTTP ${res.status}`);
  }
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "application/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("Language.xml のXML解析に失敗しました");
  }

  languageData = {};
  Array.from(xml.getElementsByTagName("message")).forEach(messageNode => {
    const messageKey = messageNode.getAttribute("name");
    const perLang = {};
    Array.from(messageNode.getElementsByTagName("language")).forEach(el => {
      perLang[el.getAttribute("name")] = el.innerHTML.trim();
    });
    languageData[messageKey] = perLang;
  });
}

/**
 * data-i18n-key 属性を持つすべての要素に対して、指定言語の翻訳文を流し込む。
 * 該当言語が無ければ FALLBACK_LANG、それも無ければ空文字のまま。
 * 例: <div id="message" data-i18n-key="OneMomentPlease"></div>
 */
function applyLanguage(langCode) {
  document.querySelectorAll("[data-i18n-key]").forEach(el => {
    const key = el.getAttribute("data-i18n-key");
    const perLang = languageData[key];
    if (!perLang) {
      console.warn(`Language.xml に message name="${key}" が見つかりません`);
      return;
    }
    const html = perLang[langCode] || perLang[FALLBACK_LANG];
    el.innerHTML = html || "";
  });
}

/**
 * WebView2でホストされている場合、WinForms側(C#)へメッセージを送る。
 * WinForms側は CoreWebView2.WebMessageReceived で受信する想定。
 * 通常のブラウザ(WebView2ホストが無い環境)で開いた場合は、コンソールログのみ出力する。
 *
 * @param {string} action  実行されたアクション名（例: "confirm"）
 * @param {object} [extra] 追加で送りたい情報（任意）
 */
function notifyHost(action, extra) {
  const payload = Object.assign({ action: action, page: location.pathname }, extra || {});

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.postMessage(JSON.stringify(payload));
    console.log("WinForms側へメッセージを送信しました:", payload);
  } else {
    console.log("[WebView2ホストが検出されないため送信をスキップ]", payload);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadLanguages();
    applyLanguage(detectLang());
  } catch (ex) {
    console.error(ex);
    document.querySelectorAll("[data-i18n-key]").forEach(el => {
      el.textContent = "言語ファイルの読み込みに失敗しました。";
    });
  }
});
