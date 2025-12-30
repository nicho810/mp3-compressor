type GithubLinkBannerProps = {
  href: string
  label: string
  repo: string
}

export default function GithubLinkBanner({ href, label, repo }: GithubLinkBannerProps) {
  return (
    <footer className="vds-githubLinkBanner" aria-label="GitHub">
      <a className="vds-githubLinkBanner__link" href={href} target="_blank" rel="noreferrer noopener">
        <svg className="vds-githubLinkBanner__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 .5C5.73.5.75 5.78.75 12.27c0 5.2 3.44 9.62 8.2 11.18.6.12.82-.27.82-.6v-2.1c-3.34.75-4.04-1.45-4.04-1.45-.55-1.45-1.34-1.83-1.34-1.83-1.1-.78.08-.77.08-.77 1.22.09 1.86 1.3 1.86 1.3 1.08 1.92 2.83 1.37 3.52 1.04.11-.8.42-1.37.76-1.68-2.66-.31-5.47-1.38-5.47-6.14 0-1.36.46-2.47 1.22-3.35-.12-.31-.53-1.58.11-3.3 0 0 1-.33 3.3 1.28.96-.28 1.98-.42 3-.43 1.02.01 2.04.15 3 .43 2.3-1.61 3.3-1.28 3.3-1.28.64 1.72.23 2.99.11 3.3.76.88 1.22 1.99 1.22 3.35 0 4.77-2.81 5.83-5.49 6.14.43.39.82 1.14.82 2.3v3.41c0 .33.22.73.83.6 4.75-1.56 8.19-5.98 8.19-11.18C23.25 5.78 18.27.5 12 .5z"
          />
        </svg>
        <span>{label}</span>
        <span className="vds-githubLinkBanner__repo">{repo}</span>
      </a>
    </footer>
  )
}
