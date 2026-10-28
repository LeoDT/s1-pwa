# 家庭代理部署

UI、访问令牌引导和阅读历史仍在 Cloudflare；家庭服务只提供内容代理，不需要 D1、HISTORY_SECRET 或持久化目录。代理复用 `server/core`，Node 适配层仅使用内置模块。

## 前提

- Raspberry Pi 上有**系统级 Node.js 20.19 或更新版本**，默认路径 `/usr/bin/node`。不需要 pnpm/npm install，也不需要在 Pi 上构建。
- Caddy 已提供设备信任的 HTTPS 私有域名，并能够转发到 `127.0.0.1:8788`。
- 访问令牌与现有 Cloudflare `ACCESS_TOKEN` 一致。

`systemd` 不加载交互 shell 的 fnm/nvm 环境。若 Node 不在 `/usr/bin/node`，修改服务的 `ExecStart` 为实际的系统级绝对路径；不要使用用户主目录下的 Node，服务的 `ProtectHome=yes` 会阻止访问。

## 1. 本机构建、上传

在现有开发机的项目根目录运行。上述 Node ≥20.19 要求只针对家庭代理部署包；完整项目的测试工具链依赖较新的 Node（包括 `node:sqlite`），继续使用开发机现有的新版本即可，不要在 Pi 上安装整个源码项目：

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm package:proxy
scp dist-proxy/s1-pwa-proxy.tar.gz user@raspberrypi:~/
```

打包脚本使用 esbuild，将 TS 和所需 core 代码合并为 `server.mjs`。包内只有：

- `server.mjs`：可直接运行的 Node ESM，无第三方运行时依赖，与构建机 CPU 架构无关。
- `s1-pwa-proxy.service`：完整 systemd 服务。
- `s1-pwa-proxy.env.example`：不含真实令牌的配置模板。
- `README.md`、`build.json`：部署说明和构建信息。

不会包含 `.dev.vars`、前端、数据库、node_modules 或本机配置。`pnpm build` / `pnpm deploy` 仍只负责现有 Cloudflare UI/Worker；家庭代理单独打包。

## 2. 服务器首次安装

```bash
ssh user@raspberrypi
/usr/bin/node --version  # 必须 >=20.19，支持 v20.19.2

sudo install -d -m 0755 /opt/s1-pwa-proxy
sudo tar -xzf ~/s1-pwa-proxy.tar.gz -C /opt/s1-pwa-proxy --no-same-owner
sudo chown -R root:root /opt/s1-pwa-proxy

sudo install -m 0600 /opt/s1-pwa-proxy/s1-pwa-proxy.env.example /etc/s1-pwa-proxy.env
sudoedit /etc/s1-pwa-proxy.env
```

唯一必填项：

```ini
ACCESS_TOKEN=填入与Cloudflare相同的现有访问令牌
```

可选配置及默认值：

```ini
HOST=127.0.0.1
PORT=8788
ALLOWED_ORIGIN=https://s1-pwa.leodt2.workers.dev
```

`ALLOWED_ORIGIN` 必须是 PWA 的精确来源，不能带末尾 `/`。如果将来换 PWA 域名，需要同步修改；不支持 `*`。家庭服务自己的域名不需要配置在服务端。

```bash
sudo install -m 0644 /opt/s1-pwa-proxy/s1-pwa-proxy.service /etc/systemd/system/s1-pwa-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable --now s1-pwa-proxy
sudo systemctl status s1-pwa-proxy --no-pager
```

服务采用 `DynamicUser`，无需手动建用户。代码目录保持 root 所有、服务只读；真实配置独立保存在 `/etc`，systemd 读取后注入进程。

## 3. Caddy

将下面的示例域名替换成自己的私有域名，并沿用已有证书配置：

```caddyfile
s1-proxy.home.example {
    tls internal
    reverse_proxy 127.0.0.1:8788
}
```

如果你使用的不是 Caddy internal CA，就保留你现有的 `tls` 设置。不要再在 Caddy 层重复添加 CORS 响应头，也不要对 OPTIONS 增加 Basic Auth；应用自己校验来源和访问令牌。

该域名应在家庭网络直接解析到网关，不经过 Cloudflare 橙云或 Tunnel，否则无法绕开 Cloudflare。默认不要把 8788 端口或代理域名暴露到公网。

## 4. PWA 设置

先单独部署新版 Cloudflare UI，然后在设置 → 家庭代理中填写：

```text
家庭代理地址：https://s1-proxy.home.example
```

点击「保存并检测」。必须是 HTTPS origin，不能含路径、查询参数、账号密码或片段。

- 检测通过后显示「内容代理：家庭服务器」。
- 未配置或勾选「仅使用 Cloudflare」时完全维持原有请求路径。
- 家庭探针约 1 秒超时；失败冷却 30 秒，后续内容请求再尝试。
- 返回前台、窗口聚焦、恢复联网时重新检测。
- 家庭内容 GET 网络失败/超时/502/503/504 时有限回退。普通内容请求约 8 秒超时，附件约 30 秒；浏览器在授权提示期间可能有平台差异。
- 单次代理跳转链固定节点；登录从表单获取到提交、跳转固定节点。登录 POST 不会自动在另一节点重放；如家庭代理在登录中途失效，刷新登录表单后再尝试。
- 图片缓存键不随节点改变；外站图片仍由浏览器直连。
- 阅读历史及配置始终走 Cloudflare。不能连 Cloudflare 时已产生的阅读进度保留在本地 outbox，恢复后补传；并不意味着家庭代理能替代整个离线应用。

## 5. 覆盖更新

本机重新打包、scp 后，在服务器运行：

```bash
sudo tar -xzf ~/s1-pwa-proxy.tar.gz -C /opt/s1-pwa-proxy --no-same-owner
sudo chown -R root:root /opt/s1-pwa-proxy
sudo install -m 0644 /opt/s1-pwa-proxy/s1-pwa-proxy.service /etc/systemd/system/s1-pwa-proxy.service
sudo systemctl daemon-reload
sudo systemctl restart s1-pwa-proxy
sudo systemctl status s1-pwa-proxy --no-pager
```

这不会覆盖 `/etc/s1-pwa-proxy.env`。不需要迁移数据库、安装依赖或更新证书。更新前保留旧压缩包即可按同一流程回滚。

查看日志：

```bash
sudo journalctl -u s1-pwa-proxy -n 50 --no-pager
sudo journalctl -u s1-pwa-proxy -f
```

## 6. 验收

1. 未带令牌访问 `/api/health` 返回 401；带正确 `X-App-Token` 返回 `{"ok":true,"service":"s1-pwa-proxy","protocol":1}`。
2. 桌面浏览器通过 PWA 设置检测成功，Network 中 `/api/proxy`、`/api/img`、`/api/file` 发往家庭域名；`/api/history*`、`/api/config` 仍发往 Cloudflare。
3. 在已安装的 iOS PWA 重复验证。设备信任证书不等于授予本地网络权限；浏览器/系统可能额外请求授权，拒绝时应能使用 Cloudflare。
4. 通过家庭节点登录后，验证 Cloudflare 历史同步；超过 10 分钟身份缓存后再次验证，随后在第二台设备检查续读。
5. 停止服务或关闭 Wi-Fi，刷新帖子应能回退；恢复家庭连接、回到前台后可重新检测成功。登录提交中断不能自动重发密码。
6. 关闭家庭优先或清空地址，不应影响 Cookie、本地历史、缓存及已有登录。

## 安全边界

- 除受来源限制的 OPTIONS 预检外，全部家庭 API（包括 health）均鉴权；启动缺少令牌会失败。
- 仅精确允许的 PWA origin 可以读取跨域响应；PWA 健康探针不发送 S1 Cookie。CORS 不是鉴权替代品，无 Origin 的 CLI 仍必须提供令牌。
- PWA 对家庭地址使用 `credentials: omit` 和 `redirect: error`，不把浏览器环境 Cookie 或代理令牌通过 HTTP 重定向泄露。
- 家庭端仅访问 `stage1st.com` 及其子域，HTTP/HTTPS 的 80/443 端口；外站目标会失败。使用 Node 原生 fetch，每个上游重定向目标均重新校验域名白名单。按仅家庭网络部署的约定，不额外校验 DNS 解析结果；本服务不适合作为公网通用代理。
- 请求体最多 16KB；上游请求含响应读取最多 15 秒，原生解压后响应体最多 50MB；core 另外限制图片 12MB、附件 50MB。
- Node 入口日志不记录请求头、Cookie 或 body；共享 core 的上游错误诊断仍遵循原有日志策略。不要在 Caddy 开启记录凭证的自定义日志字段，也不要把真实令牌加入仓库。
