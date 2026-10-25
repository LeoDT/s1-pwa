import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { setAppToken } from '@/lib/api'
import { errorMessage } from '@/lib/errors'

/**
 * 部署启用了 ACCESS_TOKEN 而本机还没填写时的引导页。
 * 令牌与 S1 身份无关，只是防止代理被他人白用。
 */
export function TokenForm() {
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const mutation = useMutation({
    mutationFn: async (value: string) => {
      await setAppToken(value)
      await queryClient.invalidateQueries({ queryKey: ['app-token'] })
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })

  return (
    <form
      className="mx-auto mt-10 w-full max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (token.trim()) mutation.mutate(token.trim())
      }}
    >
      <div className="flex items-center gap-2 text-heading">
        <KeyRound size={20} />
        <h2 className="text-[17px] font-semibold">需要访问令牌</h2>
      </div>
      <p className="text-[14px] leading-relaxed text-text">
        这台服务器开启了访问令牌。令牌在部署时设置（
        <code className="rounded bg-panel-light px-1 py-0.5 text-[12.5px]">
          wrangler secret put ACCESS_TOKEN
        </code>
        ），填一次即可，本机会记住。
      </p>
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="访问令牌"
        autoComplete="off"
        className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[15px] text-text placeholder:text-muted"
      />
      {mutation.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(mutation.error)}</p>
      ) : null}
      <button
        type="submit"
        disabled={mutation.isPending || token.trim() === ''}
        className="w-full rounded-md bg-accent-strong px-3 py-2 text-[15px] font-medium text-on-accent active:opacity-90 disabled:opacity-50"
      >
        {mutation.isPending ? '保存中…' : '保存并继续'}
      </button>
    </form>
  )
}
