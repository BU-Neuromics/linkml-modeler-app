// Splash / Welcome page — shown when no project is loaded.

import React from 'react';
import './SplashPage.css';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { getRecentProjects, removeRecentProject } from '../project/recentProjects.js';
import { openProjectFromDirectory, createNewProject } from '../project/projectLoader.js';
import type { RecentProject } from '../model/index.js';
import { BookOpen, FilePlus, Folder, FolderOpen, GitBranch, Link2, Monitor, Moon, PlayCircle, Sun, X } from '../ui/icons/index.js';
import { Button } from '../ui/Button.js';
import { useTheme, type Theme } from '../ui/useTheme.js';
import { version } from '../../package.json';

const THEME_ICON: Record<Theme, React.ReactNode> = {
  dark: <Moon size={14} />,
  light: <Sun size={14} />,
  system: <Monitor size={14} />,
};

const NEXT_THEME: Record<Theme, Theme> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
};

const THEME_LABEL: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

export function SplashPage({ demoUrl, onLoadDemo }: { demoUrl?: string; onLoadDemo?: () => Promise<void> }) {
  const platform = usePlatform();
  const setProject = useAppStore((s) => s.setProject);
  const setGitAvailable = useAppStore((s) => s.setGitAvailable);
  const pushToast = useAppStore((s) => s.pushToast);
  const setCloneDialogOpen = useAppStore((s) => s.setCloneDialogOpen);
  const setHiddenSchemaIds = useAppStore((s) => s.setHiddenSchemaIds);
  const { theme, setTheme } = useTheme();

  const [recentProjects, setRecentProjects] = React.useState<RecentProject[]>(() => getRecentProjects());
  const [isLoading, setIsLoading] = React.useState(false);

  const handleNewProject = () => {
    const project = createNewProject('Untitled Schema');
    setProject(project);
  };

  const handleOpenFolder = async () => {
    const dirPath = await platform.openDirectory();
    if (!dirPath) return;

    setIsLoading(true);
    try {
      const { project, hiddenSchemaIds } = await openProjectFromDirectory(dirPath, platform);
      if (project.schemas.length === 0) {
        pushToast({ message: 'No LinkML schemas found in this directory', severity: 'warning' });
        setIsLoading(false);
        return;
      }
      setProject(project);
      setHiddenSchemaIds(hiddenSchemaIds);
      const hasGit = await platform.initGit(dirPath);
      setGitAvailable(hasGit);
    } catch (err) {
      pushToast({
        message: `Failed to open project: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
    }
    setIsLoading(false);
  };

  const handleLoadDemo = async () => {
    if (!onLoadDemo) return;
    setIsLoading(true);
    try {
      await onLoadDemo();
    } catch (err) {
      pushToast({
        message: `Failed to load demo: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
      setIsLoading(false);
    }
  };

  const handleOpenRecent = async (recent: RecentProject) => {
    setIsLoading(true);
    try {
      const { project, hiddenSchemaIds } = await openProjectFromDirectory(recent.rootPath, platform);
      if (project.schemas.length === 0) {
        pushToast({ message: 'No LinkML schemas found — the directory may have changed', severity: 'warning' });
        setIsLoading(false);
        return;
      }
      project.name = recent.name;
      setProject(project);
      setHiddenSchemaIds(hiddenSchemaIds);
      const hasGit = await platform.initGit(recent.rootPath);
      setGitAvailable(hasGit);
    } catch (err) {
      pushToast({
        message: `Failed to open project: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
      setIsLoading(false);
    }
  };

  const handleRemoveRecent = (e: React.MouseEvent, rootPath: string) => {
    e.stopPropagation();
    removeRecentProject(rootPath);
    setRecentProjects(getRecentProjects());
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  if (isLoading) {
    return (
      <div className="splash-loading">
        <span className="splash-loading-text">Opening project...</span>
      </div>
    );
  }

  return (
    <div className="splash-root">
      <div className="splash-container">
        <div className="splash-columns">
          {/* Left column — hero */}
          <div className="splash-hero">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="LinkML Modeler" className="splash-hero-logo" width="64" height="64" />
            <h1 className="splash-hero-title">LinkML Visual Schema Editor</h1>
            <p className="splash-hero-tagline">Author and visualize LinkML schemas without hand-editing YAML.</p>

            <div className="splash-actions">
              <Button variant="primary" size="lg" icon={<FilePlus size={18} />} onClick={handleNewProject}>
                New Empty Project
              </Button>
              <Button variant="primary" size="lg" icon={<FolderOpen size={18} />} onClick={handleOpenFolder}>
                Open Local Folder
              </Button>
              <Button variant="primary" size="lg" icon={<Link2 size={18} />} onClick={() => setCloneDialogOpen(true)}>
                Clone from URL
              </Button>
              {onLoadDemo && (
                <Button variant="secondary" size="lg" icon={<PlayCircle size={18} />} onClick={handleLoadDemo}>
                  Try Demo Schema
                </Button>
              )}
            </div>

            <div className="splash-footer-links">
              {demoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Monitor size={14} />}
                  onClick={() => window.open(demoUrl, '_blank')}
                >
                  Try it live
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<BookOpen size={14} />}
                onClick={() => window.open('https://linkml.io/linkml/', '_blank')}
              >
                Documentation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('https://github.com/linkml/linkml', '_blank')}
              >
                GitHub
              </Button>
            </div>
          </div>

          {/* Right column — recent projects */}
          <div className="splash-recent">
            <h2 className="splash-recent-title">Recent Projects</h2>
            {recentProjects.length > 0 ? (
              <ul className="splash-recent-list">
                {recentProjects.map((rp) => (
                  <li key={rp.rootPath} className="splash-recent-item">
                    <button
                      className="splash-recent-trigger"
                      onClick={() => handleOpenRecent(rp)}
                    >
                      <span className="splash-recent-name">{rp.name}</span>
                      <span className="splash-recent-path" title={rp.rootPath}>{rp.rootPath}</span>
                    </button>
                    <div className="splash-recent-meta">
                      <span className="splash-recent-source">
                        {rp.source === 'git'
                          ? <><GitBranch size={10} /> git</>
                          : <><Folder size={10} /> local</>}
                      </span>
                      <span className="splash-recent-date">{formatDate(rp.lastOpened)}</span>
                      <button
                        className="splash-remove-btn"
                        onClick={(e) => handleRemoveRecent(e, rp.rootPath)}
                        title="Remove from recent"
                        aria-label={`Remove ${rp.name} from recent projects`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="splash-empty-state">
                <span className="splash-empty-icon"><FolderOpen size={32} /></span>
                <p className="splash-empty-text">Open a folder or create a new project to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Page footer: version + theme toggle */}
        <div className="splash-page-footer">
          <span>v{version}</span>
          <button
            className="splash-theme-toggle"
            onClick={() => setTheme(NEXT_THEME[theme])}
            title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
            aria-label={`Current theme: ${THEME_LABEL[theme]}. Click to cycle.`}
          >
            {THEME_ICON[theme]}
          </button>
        </div>
      </div>
    </div>
  );
}
