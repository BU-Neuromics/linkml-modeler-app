import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'LinkML Modeler App',
  description: 'Visual editor for LinkML schemas',
  base: '/linkml-modeler-app/',
  ignoreDeadLinks: [/^http:\/\/localhost/],
  head: [['link', { rel: 'icon', href: '/linkml-modeler-app/favicon.svg', type: 'image/svg+xml' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'User Guide', link: '/user-guide' },
      { text: 'Development', link: '/development' },
      { text: 'Design Spec', link: '/design-spec' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Quickstart Tutorial', link: '/quickstart' },
          { text: 'User Guide', link: '/user-guide' },
        ],
      },
      {
        text: 'Canvas & Display',
        items: [
          { text: 'Display Panel', link: '/display-panel' },
          { text: 'View Modes (Canvas / Outline / Table)', link: '/view-modes' },
          { text: 'Named Views & Subsets', link: '/views-and-subsets' },
        ],
      },
      {
        text: 'Developer',
        items: [
          { text: 'Development Guide', link: '/development' },
          { text: 'Design Spec', link: '/design-spec' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/adamlabadorf/linkml-modeler-app' },
    ],
  },
})
