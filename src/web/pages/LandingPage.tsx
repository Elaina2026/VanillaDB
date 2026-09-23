import React, { useState, useEffect, useRef } from 'react';
import { LogoIcon } from '../components/LogoIcon.js';
import {
  Database,
  Shield,
  Zap,
  Lock,
  Users,
  Activity,
  Server,
  Key,
  ArrowRight,
  GitBranch,
  CheckCircle2,
  Globe,
  Code2,
  Layers,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useI18n } from '../hooks/useI18n.js';
import { useTheme } from '../hooks/useTheme.js';

// ─── Types ────────────────────────────────────────────────────────────────────
type CodeTab = 'per-tenant' | 'per-agent' | 'per-user';
type NavTarget = 'login' | 'register';

// ─── Code snippets ────────────────────────────────────────────────────────────
const HERO_CODE = `import { VanillaClient } from '@vanilladb/sdk';

const vdb = new VanillaClient({
  apiKey: process.env.VDB_API_KEY,
});

// Spin up a new encrypted database in <100ms
const db = await vdb.databases.create({
  name: \`tenant-\${tenantId}\`,
  encryption: 'aes-256-gcm',
  wal: true,
});

console.log(\`✓ Database ready: \${db.id}\`);`;

const HIGHLIGHT_REGEX = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")|\b(import|from|const|await|new|return|export|async|type)\b|\b(VanillaClient|Record|Promise|string|boolean|number)\b|\b(console|process|env)\b|\b(databases|tokens|webhooks|query|create|log)\b|\b(true|false|\d+(?:\.\d+)?)\b/g;

function renderHighlightedCode(code: string): React.ReactNode {
  const lines = code.trim().split('\n');
  return (
    <div className="font-mono text-[12px] sm:text-[12.5px] leading-[1.7] overflow-x-auto select-text">
      {lines.map((line, lineIdx) => {
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        const tokens: React.ReactNode[] = [];
        HIGHLIGHT_REGEX.lastIndex = 0;

        while ((match = HIGHLIGHT_REGEX.exec(line)) !== null) {
          if (match.index > lastIndex) {
            tokens.push(
              <span key={`p-${lastIndex}`} className="text-slate-200">
                {line.slice(lastIndex, match.index)}
              </span>
            );
          }
          if (match[1]) {
            tokens.push(<span key={`c-${match.index}`} className="text-slate-500 italic">{match[1]}</span>);
          } else if (match[2]) {
            tokens.push(<span key={`s-${match.index}`} className="text-emerald-400">{match[2]}</span>);
          } else if (match[3]) {
            tokens.push(<span key={`k-${match.index}`} className="text-purple-400 font-semibold">{match[3]}</span>);
          } else if (match[4]) {
            tokens.push(<span key={`t-${match.index}`} className="text-amber-300 font-medium">{match[4]}</span>);
          } else if (match[5]) {
            tokens.push(<span key={`b-${match.index}`} className="text-cyan-400">{match[5]}</span>);
          } else if (match[6]) {
            tokens.push(<span key={`m-${match.index}`} className="text-sky-300">{match[6]}</span>);
          } else if (match[7]) {
            tokens.push(<span key={`l-${match.index}`} className="text-orange-400">{match[7]}</span>);
          }
          lastIndex = HIGHLIGHT_REGEX.lastIndex;
        }

        if (lastIndex < line.length) {
          tokens.push(
            <span key={`p-${lastIndex}`} className="text-slate-200">
              {line.slice(lastIndex)}
            </span>
          );
        }

        return (
          <div key={lineIdx} className="flex hover:bg-slate-800/30 py-0.5 rounded px-1 transition-colors">
            <span className="w-7 shrink-0 select-none text-right pr-3.5 text-slate-600 font-mono text-[11px] leading-[1.9]">
              {lineIdx + 1}
            </span>
            <span className="flex-1 whitespace-pre">
              {tokens.length > 0 ? tokens : ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CODE_SNIPPETS: Record<CodeTab, { file: string; code: string }> = {
  'per-tenant': {
    file: 'per-tenant.ts',
    code: `import { VanillaClient } from '@vanilladb/sdk';

const vdb = new VanillaClient({
  apiKey: process.env.VDB_API_KEY,
});

// Every tenant gets an isolated encrypted database
const db = await vdb.databases.create({
  name: \`tenant-\${tenantId}\`,
  encryption: 'aes-256-gcm',
  wal: true,
});

// Scoped token — table-level permissions
const token = await db.tokens.create({
  permissions: ['read', 'write'],
  allowedTables: ['orders', 'products'],
  expiresIn: '30d',
});`,
  },
  'per-agent': {
    file: 'per-agent.ts',
    code: `import { VanillaClient } from '@vanilladb/sdk';

const vdb = new VanillaClient({
  apiKey: process.env.VDB_API_KEY,
});

// Each AI agent gets its own isolated memory store
const agentDb = await vdb.databases.create({
  name: \`agent-\${agentId}-\${sessionId}\`,
  encryption: 'aes-256-gcm',
});

// Execute SQL directly — no ORM overhead
const result = await agentDb.query({
  sql: 'SELECT * FROM memory WHERE relevance > ?',
  params: [0.85],
});`,
  },
  'per-user': {
    file: 'per-user.ts',
    code: `import { VanillaClient } from '@vanilladb/sdk';

const vdb = new VanillaClient({
  apiKey: process.env.VDB_API_KEY,
});

// Zero-trust per-user database with 2FA enforcement
const userDb = await vdb.databases.create({
  name: \`user-\${userId}\`,
  encryption: 'aes-256-gcm',
  accessRole: 'owner',
});

// Webhook triggers on every mutation
await userDb.webhooks.create({
  url: 'https://yourapp.com/sync',
  events: ['insert', 'update', 'delete'],
});`,
  },
};

// ─── Reveal hook ─────────────────────────────────────────────────────────────
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, className = '', style }) => {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
export const LandingPage: React.FC<{
  onGetStarted: () => void;
  onNavigate?: (target: NavTarget) => void;
}> = ({ onGetStarted, onNavigate }) => {
  const { t, language, toggleLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<CodeTab>('per-tenant');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Scroll-lock mobile menu
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Page-exit animation helper
  const navigate = (target: NavTarget) => {
    setLeaving(true);
    setTimeout(() => {
      if (onNavigate) onNavigate(target);
      else onGetStarted();
    }, 300);
  };

  // ── Pillar data (uses t()) ─────────────────────────────────────────────────
  const PILLARS = [
    { num: '01', icon: <Layers className="w-5 h-5 text-blue-500 dark:text-blue-400" />, title: t('landing.pillar01Title'), desc: t('landing.pillar01Desc'), ring: 'ring-blue-500/30', iconBg: 'bg-blue-500/10 dark:bg-blue-500/20', numColor: 'text-blue-500 dark:text-blue-400' },
    { num: '02', icon: <Shield className="w-5 h-5 text-sky-500 dark:text-sky-400"   />, title: t('landing.pillar02Title'), desc: t('landing.pillar02Desc'), ring: 'ring-sky-500/30',    iconBg: 'bg-sky-500/10 dark:bg-sky-500/20',    numColor: 'text-sky-500 dark:text-sky-400' },
    { num: '03', icon: <Zap    className="w-5 h-5 text-amber-500 dark:text-amber-400"  />, title: t('landing.pillar03Title'), desc: t('landing.pillar03Desc'), ring: 'ring-amber-500/30',  iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',  numColor: 'text-amber-500 dark:text-amber-400' },
    { num: '04', icon: <Key    className="w-5 h-5 text-purple-500 dark:text-purple-400" />, title: t('landing.pillar04Title'), desc: t('landing.pillar04Desc'), ring: 'ring-purple-500/30', iconBg: 'bg-purple-500/10 dark:bg-purple-500/20', numColor: 'text-purple-500 dark:text-purple-400' },
    { num: '05', icon: <Lock   className="w-5 h-5 text-rose-500 dark:text-rose-400" />, title: t('landing.pillar05Title'), desc: t('landing.pillar05Desc'), ring: 'ring-rose-500/30',   iconBg: 'bg-rose-500/10 dark:bg-rose-500/20',   numColor: 'text-rose-500 dark:text-rose-400' },
    { num: '06', icon: <Globe  className="w-5 h-5 text-cyan-500 dark:text-cyan-400"   />, title: t('landing.pillar06Title'), desc: t('landing.pillar06Desc'), ring: 'ring-cyan-500/30',   iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/20',   numColor: 'text-cyan-500 dark:text-cyan-400' },
  ];

  const FEATURES = [
    { icon: <Database className="w-5 h-5 text-blue-500 dark:text-blue-400"   />, title: t('landing.feat01Title'), desc: t('landing.feat01Desc') },
    { icon: <Shield   className="w-5 h-5 text-indigo-500 dark:text-indigo-400"/>, title: t('landing.feat02Title'), desc: t('landing.feat02Desc') },
    { icon: <Activity className="w-5 h-5 text-amber-500 dark:text-amber-400"  />, title: t('landing.feat03Title'), desc: t('landing.feat03Desc') },
    { icon: <Globe    className="w-5 h-5 text-purple-500 dark:text-purple-400" />, title: t('landing.feat04Title'), desc: t('landing.feat04Desc') },
    { icon: <Key      className="w-5 h-5 text-rose-500 dark:text-rose-400"   />, title: t('landing.feat05Title'), desc: t('landing.feat05Desc') },
    { icon: <Server   className="w-5 h-5 text-cyan-500 dark:text-cyan-400"   />, title: t('landing.feat06Title'), desc: t('landing.feat06Desc') },
    { icon: <Code2    className="w-5 h-5 text-pink-500 dark:text-pink-400"   />, title: t('landing.feat07Title'), desc: t('landing.feat07Desc') },
    { icon: <Lock     className="w-5 h-5 text-orange-500 dark:text-orange-400" />, title: t('landing.feat08Title'), desc: t('landing.feat08Desc') },
    { icon: <Layers   className="w-5 h-5 text-sky-500 dark:text-sky-400" />, title: t('landing.feat09Title'), desc: t('landing.feat09Desc') },
  ];

  const PILLS = [
    { icon: <Database className="w-3.5 h-3.5" />, label: t('landing.pillUnlimitedDbs') },
    { icon: <Users    className="w-3.5 h-3.5" />, label: t('landing.pillRbac') },
    { icon: <Activity className="w-3.5 h-3.5" />, label: t('landing.pillTelemetry') },
    { icon: <Globe    className="w-3.5 h-3.5" />, label: t('landing.pillCluster') },
    { icon: <Code2    className="w-3.5 h-3.5" />, label: t('landing.pillRest') },
    { icon: <Server   className="w-3.5 h-3.5" />, label: t('landing.pillJobs') },
  ];

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground overflow-x-hidden select-none"
      style={{
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'translateY(-12px) scale(0.99)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.28s ease, transform 0.28s ease',
      }}
    >
      {/* Subtle dot-grid — respects theme */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.35] dark:opacity-[0.22]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          color: 'var(--tw-color-border, hsl(var(--border)))',
        }}
      />

      {/* Ambient top glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-x-0 top-0 h-[450px] bg-gradient-to-b from-blue-500/10 dark:from-blue-600/15 via-blue-500/5 to-transparent blur-2xl" />
      </div>

      {/* Border wrapper */}
      <div className="relative z-10 max-w-7xl mx-auto border-x border-border">

        {/* ── NAVBAR ────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 sm:px-8 py-4">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <LogoIcon className="w-7 h-7" />
              <span className="font-bold text-sm tracking-tight text-foreground">VanillaDatabase</span>
            </div>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
              <a href="#features"    className="hover:text-foreground transition-colors duration-200">{t('landing.navFeatures')}</a>
              <a href="#security"    className="hover:text-foreground transition-colors duration-200">{t('landing.navSecurity')}</a>
              <a href="#quickstart"  className="hover:text-foreground transition-colors duration-200">{t('landing.navQuickstart')}</a>
              <a href="https://github.com/Elaina2026/VanillaDB" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-200 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" /> {t('landing.navGitHub')}
              </a>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-xs font-semibold tracking-wide hidden sm:flex items-center gap-1.5"
                aria-label="Toggle language"
              >
                <Globe className="w-4 h-4" />
                {language === 'vi' ? 'EN' : 'VI'}
              </button>
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={() => navigate('login')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block px-2"
              >
                {t('landing.signIn')}
              </button>

              <button
                onClick={() => navigate('register')}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 hover:-translate-y-px"
              >
                {t('landing.getStarted')}
              </button>

              {/* Mobile hamburger */}
              <button
                className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => setMobileMenuOpen(v => !v)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden px-5 pb-5 border-t border-border space-y-0.5 pt-3">
              {[
                ['#features',   t('landing.navFeatures')],
                ['#security',   t('landing.navSecurity')],
                ['#quickstart', t('landing.navQuickstart')],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </a>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                <button onClick={toggleLanguage} className="w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors flex items-center justify-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  {language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
                </button>
                <button onClick={() => navigate('login')}    className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">{t('landing.signIn')}</button>
                <button onClick={() => navigate('register')} className="w-full py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">{t('landing.getStartedFree')}</button>
              </div>
            </div>
          )}
        </nav>

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="px-5 sm:px-8 py-24 md:py-32 border-b border-border">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center max-w-6xl mx-auto">

            {/* Left copy */}
            <div className="space-y-7">
              <div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/25 dark:border-blue-500/30 text-blue-500 dark:text-blue-400 shadow-sm"
                style={{ animation: 'ldFadeDown 0.55s ease both' }}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                {t('landing.badge')}
              </div>

              <h1
                className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold leading-[1.08] tracking-tight text-foreground"
                style={{ animation: 'ldFadeDown 0.55s ease 0.09s both' }}
              >
                {t('landing.heroTitle1')}
                <br />
                <span className="text-blue-500 dark:text-blue-400">{t('landing.heroTitle2')}</span>
              </h1>

              <p
                className="text-base sm:text-lg leading-relaxed text-muted-foreground dark:text-slate-300 max-w-xl"
                style={{ animation: 'ldFadeDown 0.55s ease 0.18s both' }}
              >
                {t('landing.heroDesc')}
              </p>

              <div
                className="flex flex-wrap items-center gap-3"
                style={{ animation: 'ldFadeDown 0.55s ease 0.27s both' }}
              >
                <button
                  onClick={() => navigate('register')}
                  className="px-6 py-3 rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 flex items-center gap-2 hover:-translate-y-px shadow-lg shadow-blue-600/25"
                >
                  {t('landing.startFree')}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#quickstart"
                  className="px-6 py-3 rounded-full text-sm font-semibold border border-border/80 dark:border-slate-700 text-foreground/80 dark:text-slate-200 hover:text-foreground hover:border-foreground/30 dark:hover:border-slate-500 transition-all duration-200 bg-card/40"
                >
                  {t('landing.viewQuickstart')}
                </a>
              </div>

              <div
                className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground dark:text-slate-300 font-medium"
                style={{ animation: 'ldFadeDown 0.55s ease 0.36s both' }}
              >
                {[t('landing.trustNoCc'), t('landing.trust100db'), t('landing.trustEncrypted')].map(txt => (
                  <span key={txt} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    {txt}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: code card */}
            <div
              className="rounded-2xl overflow-hidden border border-border/80 dark:border-slate-800 bg-[#0B0F17] dark:bg-[#070A12] shadow-2xl"
              style={{
                animation: 'ldFadeUp 0.65s ease 0.18s both',
                boxShadow: '0 0 50px rgba(59,130,246,0.1), 0 24px 48px rgba(0,0,0,0.35)',
              }}
            >
              {/* Window chrome */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 dark:border-slate-800/80 bg-slate-900/60 dark:bg-slate-950/80">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500/80"   />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-[11px] font-mono text-slate-400">setup.ts</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">TypeScript</span>
              </div>
              <div className="p-5">
                {renderHighlightedCode(HERO_CODE)}
              </div>
            </div>
          </div>

          {/* Feature pills */}
          <Reveal
            className="flex flex-wrap items-center justify-center gap-2.5 mt-16 pt-10 border-t border-border"
          >
            {PILLS.map(f => (
              <div
                key={f.label}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-card dark:bg-[#0e1422] border border-border/80 dark:border-slate-800 text-foreground/80 dark:text-slate-200 hover:text-foreground hover:border-blue-500/50 hover:bg-blue-500/5 dark:hover:bg-blue-500/10 transition-all shadow-sm"
              >
                <span className="text-blue-500 dark:text-blue-400">{f.icon}</span>
                {f.label}
              </div>
            ))}
          </Reveal>
        </section>

        {/* ── PROBLEM / SOLUTION ────────────────────────────────────────── */}
        <section id="features" className="px-5 sm:px-8 py-20 border-b border-border">
          <Reveal className="max-w-4xl mx-auto text-center space-y-4 mb-14">
            <p className="text-xs font-mono text-blue-500 dark:text-blue-400 uppercase tracking-widest font-semibold">{t('landing.problemLabel')}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight text-foreground">
              {t('landing.problemTitle')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground dark:text-slate-300 max-w-2xl mx-auto">
              {t('landing.problemDesc')}
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            <Reveal delay={0}>
              <div className="rounded-2xl p-6 space-y-4 h-full bg-card dark:bg-[#0e1422] border border-red-500/30 shadow-lg shadow-red-500/5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-500 dark:text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {t('landing.centralizedLabel')}
                </div>
                <p className="text-sm text-foreground/80 dark:text-slate-300 leading-relaxed">{t('landing.centralizedDesc')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {['A','B','C','D','E','F'].map(l => (
                    <div key={l} className="text-xs text-center px-2 py-2 rounded-lg font-mono bg-red-500/10 border border-red-500/25 text-red-400 font-medium">
                      Tenant {l}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-center font-mono text-muted-foreground dark:text-slate-400 font-medium">{t('landing.sharedPostgres')}</div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div
                className="rounded-2xl p-6 space-y-4 h-full bg-card dark:bg-[#0e1422] border border-blue-500/40 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/20"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  {t('landing.vanillaLabel')}
                </div>
                <p className="text-sm text-foreground/80 dark:text-slate-300 leading-relaxed">{t('landing.vanillaDesc')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {['A','B','C','D','E','F'].map(l => (
                    <div key={l} className="text-xs text-center px-2 py-2 rounded-lg font-mono bg-blue-500/15 border border-blue-500/30 text-blue-400 font-semibold shadow-sm">
                      Tenant {l}<br />
                      <span className="text-[10px] text-blue-300 font-normal">{t('landing.ownDb')}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-center font-mono text-blue-400 font-semibold">{t('landing.isolatedSqlite')}</div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 6 PILLARS — grid, no scroll ───────────────────────────────── */}
        <section id="security" className="px-5 sm:px-8 py-20 border-b border-border">
          <Reveal className="max-w-5xl mx-auto text-center space-y-3 mb-14">
            <p className="text-xs font-mono text-blue-500 dark:text-blue-400 uppercase tracking-widest font-semibold">{t('landing.archLabel')}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              {t('landing.archTitle')}
            </h2>
            <p className="text-sm text-muted-foreground dark:text-slate-300 max-w-xl mx-auto mt-3">{t('landing.archDesc')}</p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {PILLARS.map((p, i) => (
              <Reveal key={p.num} delay={i * 55}>
                <div
                  className="group rounded-2xl p-5 space-y-4 h-full bg-card dark:bg-[#0e1422] border border-border/80 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1 cursor-default"
                >
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.iconBg} ring-1 ${p.ring} shadow-sm`}>
                      {p.icon}
                    </div>
                    <span className={`font-mono text-2xl font-black ${p.numColor} opacity-50 group-hover:opacity-100 transition-opacity`}>
                      {p.num}
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-foreground group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors mb-1.5">{p.title}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground dark:text-slate-300">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CODE SWITCHER ─────────────────────────────────────────────── */}
        <section id="quickstart" className="px-5 sm:px-8 py-20 border-b border-border">
          <div className="grid lg:grid-cols-[2fr,3fr] gap-12 items-start max-w-6xl mx-auto">

            {/* Left sticky copy */}
            <Reveal className="space-y-6 lg:sticky lg:top-24">
              <p className="text-xs font-mono text-blue-500 dark:text-blue-400 uppercase tracking-widest font-semibold">{t('landing.devExpLabel')}</p>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight text-foreground">
                {t('landing.devExpTitle1')}<br />
                {t('landing.devExpTitle2')}<br />
                <span className="text-blue-500 dark:text-blue-400">{t('landing.devExpTitle3')}</span>
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground dark:text-slate-300">{t('landing.devExpDesc')}</p>
              <ul className="space-y-2.5">
                {[
                  t('landing.sdkList1'),
                  t('landing.sdkList2'),
                  t('landing.sdkList3'),
                  t('landing.sdkList4'),
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground/85 dark:text-slate-200">
                    <ChevronRight className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('register')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 hover:-translate-y-px shadow-lg shadow-blue-600/25"
              >
                {t('landing.startBuilding')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </Reveal>

            {/* Right: tabbed code */}
            <Reveal>
              <div
                className="rounded-2xl overflow-hidden border border-border/80 dark:border-slate-800 bg-[#0B0F17] dark:bg-[#070A12] shadow-2xl"
                style={{ boxShadow: '0 0 50px rgba(59,130,246,0.1), 0 20px 40px rgba(0,0,0,0.35)' }}
              >
                {/* Tab bar */}
                <div className="flex items-center justify-between border-b border-border/60 dark:border-slate-800/80 bg-slate-900/60 dark:bg-slate-950/80">
                  <div className="flex overflow-x-auto">
                    {(['per-tenant', 'per-agent', 'per-user'] as CodeTab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 text-[11px] font-mono font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${
                          activeTab === tab
                            ? 'text-blue-400 border-blue-500 bg-blue-500/10'
                            : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                      >
                        {CODE_SNIPPETS[tab].file}
                      </button>
                    ))}
                  </div>
                  <span className="hidden sm:inline-block pr-4 text-[10px] font-mono text-slate-500">TypeScript</span>
                </div>
                <div className="p-5" style={{ minHeight: '260px' }}>
                  {renderHighlightedCode(CODE_SNIPPETS[activeTab].code)}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FEATURE GRID ──────────────────────────────────────────────── */}
        <section className="px-5 sm:px-8 py-20 border-b border-border">
          <div className="max-w-5xl mx-auto">
            <Reveal className="text-center mb-12 space-y-3">
              <p className="text-xs font-mono text-blue-500 dark:text-blue-400 uppercase tracking-widest font-semibold">{t('landing.everythingLabel')}</p>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{t('landing.everythingTitle')}</h2>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((item, i) => (
                <Reveal key={item.title} delay={i * 35}>
                  <div className="group rounded-2xl p-6 space-y-3.5 h-full bg-card dark:bg-[#0e1422] border border-border/80 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 dark:border-blue-500/30 text-blue-500 dark:text-blue-400 shadow-sm group-hover:scale-105 transition-transform">
                      {item.icon}
                    </div>
                    <div className="font-bold text-sm text-foreground group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">{item.title}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground dark:text-slate-300">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section className="relative px-5 sm:px-8 py-28 text-center border-b border-border overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-blue-500/10 dark:from-blue-600/15 via-blue-500/5 to-transparent blur-xl" />
          <Reveal className="relative max-w-xl mx-auto space-y-6">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              {t('landing.ctaTitle1')}<br /><span className="text-blue-500 dark:text-blue-400">{t('landing.ctaTitle2')}</span>
            </h2>
            <p className="text-sm text-muted-foreground dark:text-slate-300 leading-relaxed">{t('landing.ctaDesc')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('register')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px shadow-lg shadow-blue-600/25"
              >
                {t('landing.tryFree')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="https://github.com/Elaina2026/VanillaDB"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-3.5 rounded-full text-sm font-semibold border border-border/80 dark:border-slate-700 text-foreground/80 dark:text-slate-200 hover:text-foreground hover:border-border dark:hover:border-slate-500 transition-all duration-200 flex items-center justify-center gap-2 bg-card/50 dark:bg-card/30"
              >
                <GitBranch className="w-4 h-4" />
                {t('landing.viewGitHub')}
              </a>
            </div>
          </Reveal>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <footer className="px-5 sm:px-8 pt-14 pb-10 border-t border-border">
          {/* Top row: brand + nav columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <LogoIcon className="w-6 h-6" />
                <span className="text-sm font-bold text-foreground">VanillaDatabase</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('landing.footerBuiltOn')}
              </p>
              <a
                href="https://github.com/Elaina2026/VanillaDB"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Elaina2026/VanillaDB
              </a>
            </div>

            {/* Product */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Product</p>
              <div className="space-y-2 text-sm">
                <a href="#features"   className="block text-muted-foreground hover:text-foreground transition-colors">{t('landing.navFeatures')}</a>
                <a href="#security"   className="block text-muted-foreground hover:text-foreground transition-colors">{t('landing.navSecurity')}</a>
                <a href="#quickstart" className="block text-muted-foreground hover:text-foreground transition-colors">{t('landing.navQuickstart')}</a>
              </div>
            </div>

            {/* Platform */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Platform</p>
              <div className="space-y-2 text-sm">
                <button onClick={() => navigate('login')}    className="block text-muted-foreground hover:text-foreground transition-colors">{t('landing.signIn')}</button>
                <button onClick={() => navigate('register')} className="block text-muted-foreground hover:text-foreground transition-colors">{t('landing.getStartedFree')}</button>
                <a href="https://github.com/Elaina2026/VanillaDB" target="_blank" rel="noopener noreferrer" className="block text-muted-foreground hover:text-foreground transition-colors">GitHub</a>
              </div>
            </div>

            {/* Preferences */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Preferences</p>
              <div className="space-y-3">
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {theme === 'dark'
                    ? <><Sun  className="w-3.5 h-3.5" /> Light mode</>
                    : <><Moon className="w-3.5 h-3.5" /> Dark mode</>}
                </button>
                {/* Language toggle */}
                <button
                  onClick={toggleLanguage}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {language === 'vi' ? 'English' : 'Tiếng Việt'}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground/50">
            <span>© {new Date().getFullYear()} VanillaDatabase. MIT License.</span>
            <span>Node.js 22 · Fastify 5.2 · better-sqlite3 · React 19</span>
          </div>
        </footer>

      </div>

      {/* Hero keyframes */}
      <style>{`
        @keyframes ldFadeDown {
          from { opacity: 0; transform: translateY(-14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ldFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
