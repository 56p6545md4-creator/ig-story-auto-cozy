# 毎朝8:10（日本時間）の起動設定

外部スケジューラからの workflow_dispatch は可能です。GitHub schedule は混雑で遅延・欠落することがあるため、cron-job.org の **Asia/Tokyo 08:10 毎日**を主系にします。既存9:00ジョブは予備として残し、必要なら8:25にも予備ジョブを追加します。GitHub側の `10 23 * * *`（JST 8:10）も独立した予備として残します。コメントだけでは外部ジョブの実在・設定は確認できません。

## 外部サービスで設定する値（管理者の操作が必要）

- URL: `https://api.github.com/repos/56p6545md4-creator/ig-story-auto-cozy/actions/workflows/daily-story.yml/dispatches`
- Method: POST
- Headers: `Accept: application/vnd.github+json`、`Content-Type: application/json`、`Authorization: Bearer <専用トークン>`、`X-GitHub-Api-Version: 2026-03-10`
- Body: `{"ref":"main"}`
- タイムゾーン: Asia/Tokyo、毎日08:10。予備09:00も同一URL・本文。
- 失敗・無効化・復旧のメール通知を有効にする。テスト実行は本番投稿を起動するため朝の運用時に確認する。

GitHubのfine-grained PATを対象リポジトリだけ、**Actions: write**で作成し、有効期限・更新担当を決めてください。Contents: write や Instagramのトークンを外部サービスに渡す必要はありません。PATは起動専用の完全な権限ではなく、このリポジトリのActionsへの書き込み権限です。外部サービスの非公開ヘッダー欄だけに保存し、URL・本文・Git・ログに書かないでください。漏洩時は失効・再発行してください。GitHub Appの短期トークンを使う場合は、外部で発行・更新する仕組みが別途必要です。

## 二重投稿と再試行

mainだけで投稿し、全起動を同じconcurrencyグループで直列化します。GitHubのpending実行は後着で置き換わることがあります。publishedの当日 `last_posted.txt` があれば、セットアップ前に終了します。ブランチ取得や記録読み込みに失敗した場合は安全側に停止します。JST 8:10以前は投稿しません。

Instagramのコンテナ作成・処理完了後、**media_publishの直前**に `pending_post.txt` をpublishedへpushします。push失敗なら投稿しません。投稿成功後に `last_posted.txt` を更新してpendingを消します。投稿APIの応答喪失、記録保存失敗、途中キャンセルの場合はpendingが残り、当日の予備・再実行を停止します。投稿前の画像生成・コンテナ処理などの失敗でpendingがなければ予備で再試行できます。日付が変わった場合は投稿直前に停止します。

結果不明時はInstagramとログを確認し、投稿済みならpublishedのlast_posted.txtを当日JSTの日付に更新してpending_post.txtを削除してください。未投稿と確認できた場合だけpendingを削除し、朝8:10以降に再実行できます。記録を消して強制再投稿する自動機能はありません。翌日は新しい日付として動作します。手動の `npm run post` など、このworkflow外からの投稿にはこのガードは適用されません。

## 通知と確認

処理失敗はGitHub Issue `Instagram daily story: action required` を作成、既存Issueがあればコメントします。リポジトリのIssues有効化、ActionsのIssues書込許可、Watch/通知メール設定を確認してください。Actionsの失敗通知も有効にしてください。Issue通知ステップ自体の失敗、キャンセル、GitHub停止、起動そのものの未達はこの通知で検知できません。cron-job.org側のHTTPエラー通知を併用します。HTTP成功は起動受付だけで、Instagram投稿成功を示しません。毎朝の投稿確認、または別系統の未投稿監視は必要です。

既存の `IG_USER_ID` と `IG_ACCESS_TOKEN` はGitHub Actions Secretsを継続使用します。今回、値の閲覧・新規発行・外部ジョブの作成・通知先の登録は行っていません。

8:10は**起動要求の目標**です。GitHub runnerの待ち時間、依存関係準備、動画生成、Instagramの処理時間があり、投稿開始・公開の正確な時刻は保証できません。cron-job.org自身にも遅延・障害があり得ます。さらに厳しい精度が必要なら、常時稼働環境で事前生成して直接投稿する別構成が必要です。

## 検証

`node --test tests/*.test.mjs`、`python3 tests/test_scheduling.py`、`bash -n scripts/claim-post.sh`。Instagram通信はモック、Git記録はローカルの一時リポジトリで検証します。本番投稿・外部認証・メール配信の疎通テストは含みません。

公式資料: [GitHub scheduleの制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[dispatch APIと権限](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)、[cron-job.orgのHTTPリクエストと通知](https://cron-job.org/en/faq/)。
