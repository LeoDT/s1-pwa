import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '@/app/router'
import { ImageLightbox } from '@/components/ImageLightbox'
import { applyPrefs, getPrefs } from '@/lib/prefs'
import { pruneImageCache } from '@/lib/imageStore'
import { pruneImageDimensions } from '@/lib/imageDimensions'
import { startContentProxyLifecycle } from '@/lib/contentProxy'
import '@/styles/tokens.css'

startContentProxyLifecycle()
applyPrefs(getPrefs())
void pruneImageCache().catch(() => undefined)
void pruneImageDimensions().catch(() => undefined)
// 图片缓存与阅读进度都在本地；申请持久化，降低被系统回收的概率。
// 浏览器可能直接拒绝（尤其 Safari），失败不影响使用。
if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* 应用级单例：不属于任何页面/内容节点 */}
      <ImageLightbox />
    </QueryClientProvider>
  </StrictMode>,
)
