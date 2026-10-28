import { useState, useSyncExternalStore } from 'react'
import {
  getContentProxyStatus, getHomeProxySettings, probeHomeProxy,
  saveHomeProxySettings, subscribeContentProxyStatus, subscribeHomeProxySettings,
} from '@/lib/contentProxy'

export function HomeProxySection() {
  const settings = useSyncExternalStore(subscribeHomeProxySettings, getHomeProxySettings)
  const status = useSyncExternalStore(subscribeContentProxyStatus, getContentProxyStatus)
  const [draft, setDraft] = useState(settings.address)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    try {
      saveHomeProxySettings({ ...settings, address: draft })
      setDraft(getHomeProxySettings().address)
      setError(null)
      await probeHomeProxy()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-ui font-medium text-muted">家庭代理</h3>
      <p className="text-meta leading-relaxed text-muted">
        在家时优先通过家庭服务器加载内容，不可用时回退 Cloudflare。阅读历史始终同步 Cloudflare。留空可关闭。
      </p>
      <label htmlFor="home-proxy-address" className="block text-ui text-text">家庭代理地址</label>
      <input
        id="home-proxy-address"
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setError(null) }}
        placeholder="https://s1-proxy.example.com"
        className="min-h-11 w-full min-w-0 rounded-md border border-line bg-canvas px-3 py-2 text-body"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status.route === 'probing'}
          className="min-h-11 rounded-md bg-accent-strong px-3 py-2 text-ui font-medium text-on-accent disabled:opacity-50"
        >
          {status.route === 'probing' ? '正在检测…' : '保存并检测'}
        </button>
        <span role="status" className="text-meta text-muted">
          {status.route === 'probing' ? '正在检测家庭代理' : `内容代理：${status.route === 'home' ? '家庭服务器' : 'Cloudflare'}`}
        </span>
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 text-ui text-text">
        <span>仅使用 Cloudflare</span>
        <input
          type="checkbox"
          checked={settings.cloudflareOnly}
          onChange={(event) => {
            try {
              saveHomeProxySettings({ ...settings, cloudflareOnly: event.target.checked })
              setError(null)
              void probeHomeProxy()
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '保存失败')
            }
          }}
          className="size-5 shrink-0 accent-[var(--color-accent-strong)]"
        />
      </label>
      {error ? <p role="alert" className="text-meta text-danger">{error}</p> : null}
      {!error && status.error ? (
        <p className="text-meta leading-relaxed text-muted">
          {status.error}。请检查地址、证书信任、访问令牌和浏览器的本地网络权限。
        </p>
      ) : null}
    </section>
  )
}
