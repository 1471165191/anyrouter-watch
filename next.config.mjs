/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * 2026-09-22：导航从 7 项收敛到 5 项，「错误码」和「客户端配置」
   * 合并成了 /guide（排障手册）。旧地址保留永久跳转，避免外部链接 404。
   */
  async redirects() {
    return [
      { source: '/errors', destination: '/guide#errors', permanent: true },
      { source: '/clients', destination: '/guide#clients', permanent: true },
    ];
  },
};

export default nextConfig;
