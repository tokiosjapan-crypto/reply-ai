// ============================================
// スマリブ返信AI — Cloudflare Workers 中継API
//
// 役割：
//   ブラウザ（GitHub Pages）→ このWorker → Anthropic API
//   APIキーはこのWorkerの環境変数だけに置き、
//   ブラウザ側には一切渡しません。
// ============================================

// モデル名はここ1か所で管理（環境変数 ANTHROPIC_MODEL が設定されていればそちらが優先）
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// AIへの基本指示（システムプロンプト）
const SYSTEM_PROMPT = `あなたは収益不動産の売買仲介会社「株式会社スマリブ」の営業担当です。
お客様や取引先からの問い合わせに対する返信文を作成します。

【厳守ルール】
- 返信文だけを出力する。解説・前置き・件名は一切付けない
- 丁寧だが長すぎない文章にする
- 売り込み感・煽り表現・過度な営業表現を避ける
- 相手に不安を与えない
- 不明点・未確認事項は断定しない（「確認のうえご連絡します」等で対応）
- 物件確認中、資料送付、内見調整、価格交渉、融資相談などの文脈に自然に対応する
- 宛名は受信メッセージから分かる場合のみ入れる（不明なら入れない）

【問い合わせ元ごとの文体】
- 楽待・健美家: 個人投資家向けに自然で丁寧な文章
- 直接問い合わせ: 丁寧で安心感のある文章
- 業者間: 簡潔で実務的な文章（過度な敬語は不要）`;

// 2パターン同時生成時の区切り文字
const DELIM_POLITE = "===POLITE===";
const DELIM_CONCISE = "===CONCISE===";

// 問い合わせ元コード → 日本語ラベル
const SOURCE_LABELS = {
  rakumachi: "楽待",
  kenbiya: "健美家",
  direct: "直接問い合わせ",
  gyosha: "業者間",
};

// トーンコード → AIへの説明
const TONE_LABELS = {
  short: "短文（2〜4文程度の短い返信）",
  standard: "標準（普通の長さの返信）",
  polite: "丁寧（しっかりした丁寧な返信）",
};

export default {
  async fetch(request, env) {
    // CORS設定：環境変数 ALLOWED_ORIGIN があればそのサイトだけ許可、なければ全許可
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // JSONレスポンスを作る共通関数（必ずCORSヘッダー付き）
    const jsonResponse = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    // ブラウザからの事前確認（プリフライト）には中身なしで応答
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // POST以外は受け付けない
    if (request.method !== "POST") {
      return jsonResponse({ error: "POSTメソッドのみ対応しています" }, 405);
    }

    try {
      // APIキーが未設定なら、設定方法が分かるエラーを返す
      if (!env.ANTHROPIC_API_KEY) {
        return jsonResponse(
          { error: "APIキーが設定されていません（ANTHROPIC_API_KEY）" },
          500
        );
      }

      // リクエストのJSONを読み取る
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: "リクエストの形式が正しくありません" }, 400);
      }

      // 入力を取り出して、長すぎる場合は切り詰める（暴走防止）
      const received = String(body.received || "").slice(0, 8000);
      const rough = String(body.rough || "").slice(0, 8000);
      const extraInstruction = String(body.extraInstruction || "").slice(0, 500);
      const source = SOURCE_LABELS[body.source] || "楽待";
      const tone = TONE_LABELS[body.tone] || TONE_LABELS.standard;
      const mode = body.mode === "single" ? "single" : "both";

      // 受信文とラフの両方が空ならエラー
      if (!received && !rough) {
        return jsonResponse(
          { error: "受信メッセージかラフ入力のどちらかを入力してください" },
          400
        );
      }

      // 使用するモデル（環境変数が優先、なければDEFAULT_MODEL）
      const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

      // ============================================
      // AIに渡すユーザーメッセージを組み立てる
      // ============================================
      let userMessage;

      if (mode === "both") {
        // ----- 通常生成：丁寧版と簡潔版を一度に作る -----
        userMessage = `以下の情報をもとに、返信文を2パターン作成してください。

【問い合わせ元】${source}
【返信トーン】${tone}
【受信メッセージ】
${received || "（なし）"}

【返したい内容のメモ】
${rough || "（なし）"}

必ず以下の形式で出力してください（区切り行はそのまま出力すること）：
${DELIM_POLITE}
（丁寧版の返信文）
${DELIM_CONCISE}
（簡潔版の返信文）`;
      } else {
        // ----- 再生成：今の文面を追加指示に従って書き直す -----
        const variant = body.variant === "concise" ? "簡潔版" : "丁寧版";
        const currentText = String(body.currentText || "").slice(0, 8000);

        userMessage = `以下は${source}からの問い合わせに対する返信文（${variant}）です。
追加指示に従って書き直してください。返信文だけを出力してください。

【返信トーン】${tone}
【受信メッセージ】
${received || "（なし）"}

【返したい内容のメモ】
${rough || "（なし）"}

【現在の返信文】
${currentText}

【追加指示】
${extraInstruction || "より良い文面に改善してください"}`;
      }

      // ============================================
      // Anthropic API を呼び出す
      // ============================================
      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      // AI側でエラーが起きた場合
      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        // 調査用にログへ詳細を残す（ユーザーには見せない）
        console.error("Anthropic APIエラー:", apiRes.status, errBody);

        if (apiRes.status === 429) {
          return jsonResponse(
            { error: "アクセスが集中しています。少し待ってから再度お試しください。" },
            502
          );
        }
        return jsonResponse(
          { error: "AI生成に失敗しました。しばらくしてから再度お試しください。" },
          502
        );
      }

      const apiJson = await apiRes.json();

      // レスポンスから本文テキストを取り出す
      let fullText = "";
      if (Array.isArray(apiJson.content)) {
        for (const block of apiJson.content) {
          if (block.type === "text") fullText += block.text;
        }
      }
      fullText = fullText.trim();

      // ============================================
      // フロントへ返す形に整える
      // ============================================
      if (mode === "both") {
        // 区切り文字で「丁寧版」「簡潔版」に分割する
        if (fullText.includes(DELIM_POLITE) && fullText.includes(DELIM_CONCISE)) {
          const afterPolite = fullText.split(DELIM_POLITE)[1] || "";
          const parts = afterPolite.split(DELIM_CONCISE);
          const polite = (parts[0] || "").trim();
          const concise = (parts[1] || "").trim();
          return jsonResponse({ polite: polite, concise: concise }, 200);
        }
        // 区切りが見つからない場合：全文を丁寧版に入れて返す
        return jsonResponse(
          {
            polite: fullText,
            concise: "（生成に失敗しました。再度お試しください）",
          },
          200
        );
      } else {
        // 再生成：1本だけ返す
        return jsonResponse({ text: fullText }, 200);
      }
    } catch (err) {
      // 想定外のエラーもログに残してJSONで返す
      console.error("Workerエラー:", err);
      return jsonResponse(
        { error: "AI生成に失敗しました。しばらくしてから再度お試しください。" },
        500
      );
    }
  },
};
