// Deployment settings. Override at build time: VITE_REPO_URL=https://github.com/<owner>/<repo>
export const config = {
  repoUrl: (import.meta.env.VITE_REPO_URL as string | undefined) ?? '',
  siteTitle: 'Книга VI — археологічні колекції',
};
