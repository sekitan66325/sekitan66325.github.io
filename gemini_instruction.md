# 真岡線運用掲示板 セキュリティ強化・管理機能 実装指示書

## 概要

現在運用中の「真岡線運用掲示板」について、一般利用者向け機能は維持しつつ、セキュリティおよび管理機能を追加する。

既存のUIはできるだけ維持し、内部実装を改善すること。

---

# システム構成

フロントエンド

- HTML
- CSS
- JavaScript

バックエンド

- Google Apps Script (WebApp)

データ保存

Google Spreadsheet

---

# スプレッドシート構成

## 投稿テーブル

シート名

```
moka_operation_board_posts
```

列構成

|列|内容|
|---|---|
|A|id(UUID)|
|B|timestamp|
|C|name|
|D|message|
|E|password_hash(SHA-256)|
|F|is_hidden(Boolean)|

---

## settings

```
settings
```

以下の値を保持する。

例

|key|value|
|---|---|
|max_name_length|20|
|max_message_length|1000|
|max_lines|50|
|post_interval_seconds|30|

GASは毎回ここから設定を取得する。

値をコードへ直接書かないこと。

---

## edit_log

```
edit_log
```

列構成

|列|内容|
|---|---|
|timestamp|
|post_id|
|action|
|before|
|after|
|actor|
|memo|

すべての編集・削除・管理者操作をここへ保存する。

---

## admins

```
admins
```

管理者アカウントを管理する。

列例

|列|内容|
|---|---|
|admin_id|
|password_hash|
|must_change_password|
|created_at|
|last_login|

初回登録時

must_change_password

は TRUE

初回ログイン後に必ず変更させる。

---

# 投稿API改善

現在の

create

edit

delete

を改修する。

---

## create

追加するバリデーション

### 名前

必須

20文字以内

前後空白除去

### 本文

必須

1000文字以内

50行以内

### パスワード

半角英数字

4文字以上

SHA-256保存

### 連続投稿制限

同じパスワードハッシュから

30秒以内の投稿は禁止

設定値はsettingsシートから取得する。

---

## edit

編集前

パスワード照合

↓

成功

↓

本文更新

↓

edit_logへ記録

before

after

actor=user

---

## delete

現在は

deleteRow()

になっている。

これを廃止する。

代わりに

F列

```
is_hidden=true
```

へ変更する。

GETでは

is_hidden=true

を返さない。

利用者からは削除されたように見える。

edit_logには

action

```
soft_delete
```

として保存する。

---

# GET

返却対象

```
is_hidden=false
```

のみ。

password_hash

is_hidden

は返却しない。

---

# 管理画面

新規作成

例

```
admin.html
```

一般ページとは独立。

リンクは公開して構わない。

認証が必須。

---

# 管理者認証

adminsシートを利用。

ログイン

↓

admin_id検索

↓

password_hash一致

↓

セッション発行

成功時のみ管理画面へ。

---

# セッション管理

GAS側でランダムトークン生成。

有効期限

24時間

トークンを利用して管理APIを利用する。

ログアウトで破棄。

---

# 初回ログイン

admins

must_change_password

TRUE

↓

パスワード変更画面へ強制遷移

↓

SHA-256保存

↓

must_change_password

FALSE

↓

通常利用開始

---

# 管理API

一般APIと分離する。

例

action

admin_login

admin_logout

admin_change_password

admin_get_posts

admin_delete

admin_restore

admin_edit

admin_get_log

など。

必ずセッション確認を行う。

---

# 管理画面機能

一覧表示

検索

削除

復元

編集

編集履歴表示

ログ閲覧

---

# 削除

利用者削除

↓

soft delete

管理者削除

↓

同じく

is_hidden=true

管理者削除も物理削除しない。

---

# 復元

管理画面から

```
is_hidden=false
```

へ戻せる。

復元も

edit_log

へ保存する。

---

# 編集履歴

すべて

edit_log

へ保存。

例

編集

```
before

↓

after
```

削除

```
before

↓

(hidden)
```

復元

```
(hidden)

↓

after
```

---

# actor

利用者

```
user
```

管理者

```
admin:管理者ID
```

とする。

---

# バリデーション

クライアントだけではなく

必ず

GAS側でも行う。

理由

フロント側は簡単に改ざん可能なため。

---

# セキュリティ

SHA-256

利用継続。

投稿内容はHTMLエスケープ。

innerHTMLを多用しない。

textContentを利用。

---

# Soft Delete

物理削除禁止。

削除=

```
is_hidden=true
```

管理者だけ復元可能。

---

# 将来追加予定

今回は実装不要。

・IP保存

・IPアクセス禁止

・BAN機能

・レート制限強化

・CAPTCHA

・メール認証

これらを追加しやすい設計にすること。

---

# コード方針

JavaScript

GAS

ともに

責務を分離する。

例

```
validation.js

api.js

modal.js

admin.js

posts.js
```

のように分割する。

1ファイルへ巨大化させない。

可読性を重視する。

---

# 最終目標

以下を満たすこと。

- 投稿の安全性向上
- GAS側バリデーション
- Soft Delete
- 編集履歴保存
- 管理画面
- 管理者認証
- セッション管理
- 初回パスワード変更
- adminsシート運用
- 将来のBAN・IP制限等を追加しやすい構造