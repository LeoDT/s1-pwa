import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LogIn } from 'lucide-react'
import { fetchLoginPage, submitLogin, type LoginInput } from '@/lib/session'
import { errorMessage } from '@/lib/errors'

const LOCK_KEY = 's1r:loginBlockedUntil'
const LOCK_MS = 15 * 60 * 1000

/** S1 连续登录失败会按 IP 锁 15 分钟；锁定期内不再发请求，避免雪上加霜 */
function useLoginLock(markBlocked: boolean) {
  const [blockedUntil, setBlockedUntil] = useState(() => {
    const raw = Number.parseInt(localStorage.getItem(LOCK_KEY) ?? '', 10)
    return Number.isFinite(raw) && raw > Date.now() ? raw : 0
  })

  useEffect(() => {
    if (!markBlocked) return
    const until = Date.now() + LOCK_MS
    localStorage.setItem(LOCK_KEY, String(until))
    setBlockedUntil(until)
  }, [markBlocked])

  useEffect(() => {
    if (!blockedUntil) return
    const timer = setTimeout(() => {
      localStorage.removeItem(LOCK_KEY)
      setBlockedUntil(0)
    }, Math.max(0, blockedUntil - Date.now()))
    return () => clearTimeout(timer)
  }, [blockedUntil])

  const remainingMinutes = blockedUntil ? Math.ceil((blockedUntil - Date.now()) / 60000) : 0
  return { blockedUntil, remainingMinutes }
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const loginPage = useQuery({
    queryKey: ['login-page'],
    queryFn: fetchLoginPage,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const [values, setValues] = useState<LoginInput>({
    username: '',
    password: '',
    questionid: '0',
    answer: '',
  })

  const [throttled, setThrottled] = useState(false)
  const lock = useLoginLock(throttled)

  const mutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      if (!loginPage.data) throw new Error('登录表单尚未就绪')
      return submitLogin(loginPage.data.form, input)
    },
    onError: (error) => {
      setThrottled(/次数过多|稍后再试|频繁/.test(errorMessage(error)))
    },
    onSuccess: (session) => {
      // 立刻写入会话缓存，避免首页命中「未登录」的旧缓存
      queryClient.setQueryData(['session'], session)
      void queryClient.invalidateQueries({ queryKey: ['local-session'] })
      void navigate({ to: '/' })
    },
  })

  const question = loginPage.data?.form.question ?? []
  const needsAnswer = values.questionid !== undefined && values.questionid !== '0'

  return (
    <form
      className="mx-auto mt-4 w-full max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate(values)
      }}
    >
      <div className="flex items-center gap-2 text-heading">
        <LogIn size={20} />
        <h2 className="text-title font-semibold">用 S1 账号登录</h2>
      </div>
      <p className="text-ui leading-relaxed text-muted">
        凭证只保存在这台设备（IndexedDB），服务端仅做转发，不落盘。
        账号若设置过安全提问，必须选对问题并填写答案，否则会计入失败次数。
      </p>

      {loginPage.isPending ? <p className="text-ui text-muted">正在读取登录页…</p> : null}

      {loginPage.isError ? (
        <div className="space-y-2 rounded-md border border-line bg-panel-light p-3">
          <p className="text-ui text-danger">{errorMessage(loginPage.error)}</p>
          <button
            type="button"
            onClick={() => void loginPage.refetch()}
            className="rounded-md border border-line bg-canvas px-3 py-1.5 text-ui"
          >
            重试
          </button>
        </div>
      ) : null}

      {loginPage.data ? (
        <>
          <Field label="用户名">
            <input
              type="text"
              autoComplete="username"
              value={values.username}
              onChange={(event) => setValues((prev) => ({ ...prev, username: event.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="密码">
            <input
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="安全提问">
            <select
              value={values.questionid}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, questionid: event.target.value }))
              }
              className={inputClass}
            >
              {question.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          {needsAnswer ? (
            <Field label="安全提问答案">
              <input
                type="text"
                autoComplete="off"
                value={values.answer}
                onChange={(event) => setValues((prev) => ({ ...prev, answer: event.target.value }))}
                className={inputClass}
              />
            </Field>
          ) : null}

          {loginPage.data.form.captcha ? (
            <p className="rounded-md border border-line bg-panel-light p-3 text-ui text-danger">
              当前需要验证码：请先用浏览器登录一次 stage1st.com，再回来重试。
            </p>
          ) : null}

          {mutation.isError ? (
            <p className="text-ui text-danger">{errorMessage(mutation.error)}</p>
          ) : null}

          {lock.remainingMinutes > 0 ? (
            <p className="rounded-md border border-line bg-panel-light p-3 text-ui text-danger">
              S1 暂时锁定登录（密码错误次数过多），约 {lock.remainingMinutes} 分钟后可重试。
              请确认账号、密码以及<strong className="font-medium">安全提问</strong>都已填对——
              账号设置过安全提问时，选错问题同样会被计为失败。
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              mutation.isPending ||
              lock.remainingMinutes > 0 ||
              values.username === '' ||
              values.password === ''
            }
            className="w-full rounded-md bg-accent-strong px-3 py-2.5 text-body font-medium text-on-accent active:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? '登录中…' : '登录'}
          </button>
        </>
      ) : null}
    </form>
  )
}

const inputClass =
  'w-full rounded-md border border-line bg-canvas px-3 py-2 text-body text-text'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-ui text-muted">{label}</span>
      {children}
    </label>
  )
}
