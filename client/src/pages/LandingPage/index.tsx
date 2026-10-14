import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Seo from '../../components/SEO/Seo';
import { MobilePropertyMock, FloatingKpis } from './ProductMocks';
import { ProductShot } from './ProductShot';
import { FeatureIcon, IconWhatsApp } from './LandingIcons';
import { LandingLogo } from './LandingLogo';
import PaynowBadge from '../../components/payments/PaynowBadge';
import { OnboardingChooser } from './OnboardingChooser';
import publicApi from '../../api/publicApi';
import {
  CONTACT,
  ROUTES,
  featureTabs,
  coreFeatures,
  howItWorks,
  zimbabwePoints,
  securityPoints,
  credibilityPoints,
  faqs,
  type FeatureKey
} from './landingData';
import { beginPaidPlan, beginTrial, writeOnboardingState } from '../../utils/onboardingState';
import './LandingPage.css';

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

type PublicPlan = {
  code: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  monthly: number | null;
  yearly: number | null;
  currency: string;
  checkout: 'paynow' | 'sales';
};

const LandingPage: React.FC = () => {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [pricesUnavailable, setPricesUnavailable] = useState(false);
  const [active, setActive] = useState<FeatureKey>('ACCOUNTING');
  const [persona, setPersona] = useState<'landlord' | 'manager'>('landlord');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNav, setOpenNav] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  const activeData = featureTabs.find((t) => t.key === active) || featureTabs[0];

  const priceFor = useCallback((code: PublicPlan['code']) => {
    const plan = plans?.find((item) => item.code === code);
    if (!plan) return null;
    const amount = cycle === 'yearly' ? plan.yearly : plan.monthly;
    return amount == null ? null : { amount, currency: plan.currency || 'USD' };
  }, [plans, cycle]);

  const formatPrice = useCallback((code: PublicPlan['code']) => {
    const price = priceFor(code);
    if (!price) return pricesUnavailable ? 'Unavailable' : '…';
    return price.currency === 'USD' ? `$${price.amount}` : `${price.currency} ${price.amount}`;
  }, [priceFor, pricesUnavailable]);

  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) => {
      publicApi.get('/billing/plans')
        .then((response) => {
          if (cancelled) return;
          const next = (Array.isArray(response.data?.plans) ? response.data.plans : []).map((plan: any) => ({
            code: plan.code,
            monthly: plan.monthly ?? plan.monthlyPrice ?? null,
            yearly: plan.yearly ?? plan.annualPrice ?? null,
            currency: plan.currency || 'USD',
            checkout: plan.checkout
          }));
          setPlans(next);
          setPricesUnavailable(next.length === 0);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 2) {
            window.setTimeout(() => load(attempt + 1), 600);
            return;
          }
          setPricesUnavailable(true);
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setOpenNav(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenNav(null);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const go = useCallback((id: string) => {
    setMenuOpen(false);
    setOpenNav(null);
    scrollToId(id);
  }, []);

  const selectFeature = useCallback((key: FeatureKey) => {
    setActive(key);
    go('product-tour');
  }, [go]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Mantis Africa',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Property management software for landlords and property managers in Zimbabwe and Africa. Manage properties, tenants, leases, payments, accounting, maintenance and reporting in one workspace.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '0',
      highPrice: String(priceFor('ENTERPRISE')?.amount ?? ''),
      offerCount: 4
    },
    provider: {
      '@type': 'Organization',
      name: 'Mantis Africa',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '8 Normandy Road, Alexandra Park',
        addressLocality: 'Harare',
        addressCountry: 'ZW'
      },
      email: CONTACT.email,
      telephone: CONTACT.phoneTel
    }
  };

  return (
    <div className="lp">
      <Seo
        title="Mantis Africa | Property Management Software"
        description="Property management software for landlords and property managers in Zimbabwe and Africa. Manage properties, tenants, leases, rent, accounting, maintenance and reporting from one workspace. Start a 14-day free trial."
        image={`${process.env.PUBLIC_URL || ''}/hero-laptop.png`}
        jsonLd={jsonLd}
      />
      <a className="lp-skip" href="#main">Skip to content</a>

      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`} ref={navRef}>
        <div className="lp-nav-inner">
          <RouterLink to="/" className="lp-logo" aria-label="Mantis Africa home">
            <LandingLogo />
          </RouterLink>

          <nav className="lp-nav-links" aria-label="Primary">
            <div className={`lp-nav-item${openNav === 'product' ? ' is-open' : ''}`}>
              <button
                className="lp-nav-btn"
                aria-expanded={openNav === 'product'}
                aria-haspopup="true"
                onClick={() => setOpenNav(openNav === 'product' ? null : 'product')}
              >
                Product
              </button>
              <div className="lp-drop" role="menu">
                {featureTabs.map((t) => (
                  <button key={t.key} role="menuitem" onClick={() => selectFeature(t.key)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className={`lp-nav-item${openNav === 'solutions' ? ' is-open' : ''}`}>
              <button
                className="lp-nav-btn"
                aria-expanded={openNav === 'solutions'}
                aria-haspopup="true"
                onClick={() => setOpenNav(openNav === 'solutions' ? null : 'solutions')}
              >
                Solutions
              </button>
              <div className="lp-drop" role="menu">
                <button role="menuitem" onClick={() => { setPersona('landlord'); go('solutions'); }}>Individual Landlords</button>
                <button role="menuitem" onClick={() => { setPersona('manager'); go('solutions'); }}>Property Managers</button>
                <button role="menuitem" onClick={() => go('solutions')}>Estate Agencies</button>
                <button role="menuitem" onClick={() => go('solutions')}>Property Owners</button>
                <button role="menuitem" onClick={() => go('solutions')}>Accountants</button>
              </div>
            </div>
            <button className="lp-nav-link" onClick={() => go('pricing')}>Pricing</button>
            <div className={`lp-nav-item${openNav === 'resources' ? ' is-open' : ''}`}>
              <button
                className="lp-nav-btn"
                aria-expanded={openNav === 'resources'}
                aria-haspopup="true"
                onClick={() => setOpenNav(openNav === 'resources' ? null : 'resources')}
              >
                Resources
              </button>
              <div className="lp-drop" role="menu">
                <button role="menuitem" onClick={() => go('start')}>Getting Started</button>
                <RouterLink role="menuitem" to={ROUTES.demo} onClick={() => setOpenNav(null)}>Product Demo</RouterLink>
                <button role="menuitem" onClick={() => go('faq')}>FAQs</button>
                <button role="menuitem" onClick={() => go('contact')}>Support</button>
              </div>
            </div>
            <button className="lp-nav-link" onClick={() => go('contact')}>Contact</button>
          </nav>

          <div className="lp-nav-cta">
            <RouterLink className="lp-login" to={ROUTES.login}>Log in</RouterLink>
            <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial()}>Start free trial</RouterLink>
            <button
              className="lp-menu-toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="lp-drawer" id="mobile-menu" onClick={() => setMenuOpen(false)}>
          <div
            className="lp-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => go('product')}>Product</button>
            <button onClick={() => go('solutions')}>Solutions</button>
            <button onClick={() => go('pricing')}>Pricing</button>
            <button onClick={() => go('faq')}>Resources</button>
            <button onClick={() => go('contact')}>Contact</button>
            <RouterLink to={ROUTES.login} onClick={() => setMenuOpen(false)}>Log in</RouterLink>
            <RouterLink to={ROUTES.demo} onClick={() => setMenuOpen(false)}>Explore demo</RouterLink>
            <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => { setMenuOpen(false); beginTrial(); }}>Start free trial</RouterLink>
          </div>
        </div>
      )}

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-heading">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <p className="lp-eyebrow">Property management software</p>
              <h1 id="hero-heading" className="lp-hero-title">
                Property management,<br />built for the way<br /><em>Africa works.</em>
              </h1>
              <p className="lp-hero-copy">
                Manage rent, tenants, owners, accounting, maintenance and more — all from one powerful platform.
              </p>
              <div className="lp-hero-actions">
                <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial()}>Start free trial</RouterLink>
                <RouterLink className="lp-btn lp-btn-ghost" to={ROUTES.demo}>Explore demo</RouterLink>
              </div>
              <ul className="lp-trust-points">
                <li>No credit card required</li>
                <li>Set up in minutes</li>
                <li>14-day free trial</li>
              </ul>
            </div>
            <div className="lp-hero-visual">
              <div className="lp-hero-stage">
                <ProductShot
                  src="/assets/product/dashboard-individual.png"
                  alt="Mantis property management dashboard showing portfolio occupancy and rent collection"
                  fallback="dashboard"
                  priority
                />
                <div className="lp-phone-wrap"><MobilePropertyMock /></div>
                <FloatingKpis />
              </div>
            </div>
          </div>
        </section>

        <section className="lp-strip" aria-label="Who Mantis is built for">
          <div className="lp-wrap lp-strip-inner">
            <p className="lp-strip-label">Built for property professionals</p>
            <ul className="lp-audiences">
              <li>Landlords</li>
              <li>Property Managers</li>
              <li>Estate Agencies</li>
              <li>Property Owners</li>
              <li>Accountants</li>
            </ul>
            <ul className="lp-trust-row">
              <li>USD, ZiG &amp; ZAR</li>
              <li>Role-based access</li>
              <li>Secure login</li>
              <li>Harare-based support</li>
            </ul>
          </div>
        </section>

        <OnboardingChooser />

        <section id="product" className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <p className="lp-kicker">Every tool you need</p>
            <h2 className="lp-h2">Manage property from one workspace.</h2>
            <p className="lp-lead">Accounting, payments, leasing, maintenance, sales and reporting — connected to the same properties and people.</p>
            <div className="lp-cards-6">
              {coreFeatures.map((feature) => (
                <article className="lp-feature-card" key={feature.key}>
                  <div className="lp-icon" aria-hidden="true"><FeatureIcon name={feature.title} /></div>
                  <h3>{feature.title}</h3>
                  <p className="lp-value">{feature.value}</p>
                  <p>{feature.body}</p>
                  <ul className="lp-checks">
                    {feature.points.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                  <button className="lp-more" type="button" onClick={() => selectFeature(feature.key as FeatureKey)}>
                    Learn more →
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="product-tour" className="lp-section lp-tour">
          <div className="lp-wrap">
            <p className="lp-kicker">See the product</p>
            <h2 className="lp-h2">The actual Mantis workspace — not stock photography.</h2>
            <div
              className="lp-tabs"
              role="tablist"
              aria-label="Product areas"
              onKeyDown={(e) => {
                const idx = featureTabs.findIndex((t) => t.key === active);
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setActive(featureTabs[(idx + 1) % featureTabs.length].key);
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setActive(featureTabs[(idx - 1 + featureTabs.length) % featureTabs.length].key);
                }
              }}
            >
              {featureTabs.map((tab) => (
                <button
                  key={tab.key}
                  className="lp-tab"
                  role="tab"
                  id={`tab-${tab.key}`}
                  aria-selected={active === tab.key}
                  aria-controls={`panel-${tab.key}`}
                  tabIndex={active === tab.key ? 0 : -1}
                  onClick={() => setActive(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div
              className="lp-tour-panel"
              role="tabpanel"
              id={`panel-${activeData.key}`}
              aria-labelledby={`tab-${activeData.key}`}
            >
              <ProductShot
                src={activeData.key === 'DASHBOARDS' ? '/assets/product/dashboard-enterprise.png' : '/assets/product/dashboard-individual.png'}
                alt={activeData.key === 'DASHBOARDS'
                  ? 'Mantis enterprise property management dashboard'
                  : 'Mantis property management dashboard showing portfolio occupancy and rent collection'}
                fallback={activeData.mock}
              />
              <div className="lp-tour-copy">
                <h3>{activeData.title}</h3>
                <p>{activeData.description}</p>
                <ul className="lp-checks">
                  {activeData.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.trial} onClick={() => beginTrial()}>{activeData.cta}</RouterLink>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">From spreadsheets to a smarter workspace</p>
            <h2 className="lp-h2">Get your property operation organised in a few simple steps.</h2>
            <div className="lp-steps">
              {howItWorks.map((step) => (
                <article className="lp-step" key={step.step}>
                  <div className="lp-step-num">{step.step}</div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="zimbabwe" className="lp-section lp-local">
          <div className="lp-wrap lp-local-grid">
            <div>
              <p className="lp-kicker">Zimbabwe</p>
              <h2 className="lp-h2">Built for property management in Zimbabwe.</h2>
              <p className="lp-lead">Local workflows. Real-world property needs.</p>
              <ul className="lp-checks" style={{ marginTop: '1.2rem' }}>
                {zimbabwePoints.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <figure className="lp-local-photo">
              <img
                src="/assets/photography/harare-rbz.jpg"
                alt="Harare skyline featuring the Reserve Bank of Zimbabwe building"
                width={1280}
                height={857}
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                Harare, Zimbabwe — Reserve Bank building on the skyline. Photo: Baynham Goredema, CC BY 2.0.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="proof" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">Built with property professionals</p>
            <h2 className="lp-h2">Designed around the people who actually run property.</h2>
            <p className="lp-lead">
              We do not publish invented testimonials. What we can show is the product itself: role-based workspaces, property-level accounting, and operations that match how agencies and landlords already work.
            </p>
            <figure className="lp-editorial-photo">
              <img
                src="/assets/photography/harare-first-street.jpg"
                alt="First Street in Harare, a Zimbabwean business district used as supporting editorial photography"
                width={1280}
                height={960}
                loading="lazy"
                decoding="async"
              />
              <figcaption>First Street, Harare. Photo: Gary Bembridge, CC BY 2.0. Editorial supporting image — not a Mantis customer.</figcaption>
            </figure>
            <div className="lp-cred-grid">
              {credibilityPoints.map((item) => (
                <article className="lp-highlight" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="lp-section lp-tour">
          <div className="lp-wrap">
            <p className="lp-kicker">See Mantis in action</p>
            <h2 className="lp-h2">An interactive look at the workspace.</h2>
            <p className="lp-lead">
              Open a labelled sample workspace with fictional properties, tenants and payments, or start a trial and click through the real dashboards.
            </p>
            <div className="lp-demo-card">
              <ProductShot
                src={persona === 'manager' ? '/assets/product/dashboard-enterprise.png' : '/assets/product/dashboard-individual.png'}
                alt={persona === 'manager'
                  ? 'Mantis enterprise property management dashboard'
                  : 'Mantis property management dashboard showing portfolio occupancy and rent collection'}
                fallback={persona === 'manager' ? 'dashboards' : 'dashboard'}
              />
            </div>
            <div className="lp-demo-actions">
              <RouterLink className="lp-btn lp-btn-primary" to={ROUTES.demo}>
                Explore sample workspace
              </RouterLink>
              <RouterLink className="lp-btn lp-btn-ghost" to={ROUTES.trial} onClick={() => beginTrial()}>Start free trial</RouterLink>
            </div>
          </div>
        </section>

        <section id="pricing" className="lp-section">
          <div className="lp-wrap lp-center">
            <p className="lp-kicker">Pricing</p>
            <h2 className="lp-h2">Simple, transparent pricing.</h2>
            <p className="lp-lead">Choose the plan that fits your portfolio. Upgrade or downgrade as you grow.</p>
            <div className="lp-toggle" role="group" aria-label="Billing cycle">
              <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
              <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly</button>
            </div>
            <div className="lp-pricing-grid">
              <article className="lp-plan" id="pricing-free">
                <div className="lp-plan-top">
                  <p className="lp-kicker">Start safely</p>
                  <span className="lp-badge">No card required</span>
                </div>
                <h3>Free Trial</h3>
                <p className="lp-price">Free <span>14 days</span></p>
                <p className="lp-who">For testing Mantis with real workflows.</p>
                <p className="lp-range">Up to 10 properties · single admin</p>
                <ul className="lp-checks">
                  <li>No credit card required</li>
                  <li>Core property workflows</li>
                  <li>Guided workspace setup</li>
                  <li>Upgrade when ready</li>
                </ul>
                <RouterLink className="lp-btn lp-btn-ghost" to={ROUTES.trial} onClick={() => beginTrial({ selectedPlan: 'TRIAL' })}>Start 14-Day Free Trial</RouterLink>
                <p className="lp-who">No payment required to get started.</p>
              </article>

              <article className="lp-plan" id="pricing-landlord">
                <div className="lp-plan-top">
                  <p className="lp-kicker">Solo landlords</p>
                </div>
                <h3>Landlord</h3>
                <p className="lp-price">{formatPrice('INDIVIDUAL')} <span>{cycle === 'monthly' ? '/mo' : '/yr'}</span></p>
                <p className="lp-who">For landlords managing their own rentals.</p>
                <p className="lp-range">1–10 properties · single admin</p>
                <ul className="lp-checks">
                  <li>Landlord dashboard</li>
                  <li>Rent and occupancy tracking</li>
                  <li>Lease expirations</li>
                  <li>Maintenance requests</li>
                </ul>
                <RouterLink className="lp-btn lp-btn-ghost" to={`${ROUTES.landlord}&cycle=${cycle}`} onClick={() => beginPaidPlan('INDIVIDUAL', { role: 'landlord', billingCycle: cycle })}>Choose Landlord</RouterLink>
                <p className="lp-who">Secure checkout via Paynow.</p>
              </article>

              <article className="lp-plan is-popular" id="pricing-manager">
                <div className="lp-plan-top">
                  <p className="lp-kicker">Agencies</p>
                  <span className="lp-badge">Most popular</span>
                </div>
                <h3>Property Manager</h3>
                <p className="lp-price">{formatPrice('SME')} <span>{cycle === 'monthly' ? '/mo' : '/yr'}</span></p>
                <p className="lp-who">For agencies with teams and owner reporting.</p>
                <p className="lp-range">10–120 properties · multi-user teams</p>
                <ul className="lp-checks">
                  <li>Agent and owner workspaces</li>
                  <li>Commission tools</li>
                  <li>Property accounts</li>
                  <li>Advanced reports</li>
                </ul>
                <RouterLink className="lp-btn lp-btn-primary" to={`${ROUTES.manager}&cycle=${cycle}`} onClick={() => beginPaidPlan('SME', { role: 'manager', billingCycle: cycle })}>Choose Property Manager</RouterLink>
                <p className="lp-who">Secure checkout via Paynow.</p>
              </article>

              <article className="lp-plan" id="pricing-enterprise">
                <div className="lp-plan-top">
                  <p className="lp-kicker">Large portfolios</p>
                </div>
                <h3>Enterprise</h3>
                <p className="lp-price">{formatPrice('ENTERPRISE')} <span>{cycle === 'monthly' ? '/mo' : '/yr'}</span></p>
                <p className="lp-who">For large portfolios and operations teams.</p>
                <p className="lp-range">Unlimited units · advanced permissions</p>
                <ul className="lp-checks">
                  <li>Portfolio analytics</li>
                  <li>API access</li>
                  <li>Priority support</li>
                  <li>Operational controls</li>
                </ul>
                {plans?.find((item) => item.code === 'ENTERPRISE')?.checkout === 'paynow' ? (
                  <RouterLink className="lp-btn lp-btn-ghost" to={`/signup?plan=ENTERPRISE&checkout=paid&cycle=${cycle}`} onClick={() => writeOnboardingState({ role: 'manager', selectedPlan: 'ENTERPRISE', registrationMode: 'paid', billingCycle: cycle })}>Choose Enterprise</RouterLink>
                ) : (
                  <a className="lp-btn lp-btn-ghost" href={ROUTES.enterprise} target="_blank" rel="noopener noreferrer" onClick={() => writeOnboardingState({ role: 'manager', selectedPlan: 'ENTERPRISE', setupMode: 'help' })}>Talk to Sales</a>
                )}
              </article>
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-kicker">Frequently asked questions</p>
            <h2 className="lp-h2">Straight answers before you start.</h2>
            <div className="lp-faq">
              {faqs.map((item, idx) => (
                <div className="lp-acc" key={item.q}>
                  <button
                    className="lp-acc-btn"
                    aria-expanded={openFaq === idx}
                    aria-controls={`faq-panel-${idx}`}
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  >
                    {item.q}
                    <span aria-hidden="true">{openFaq === idx ? '–' : '+'}</span>
                  </button>
                  <div className="lp-acc-panel" id={`faq-panel-${idx}`} hidden={openFaq !== idx}>
                    {item.a}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <p className="lp-kicker">Trust</p>
            <h2 className="lp-h2">Your property data deserves serious protection.</h2>
            <div className="lp-secure-grid">
              {securityPoints.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-final">
          <div className="lp-wrap">
            <h2 className="lp-h2">Ready to simplify your property management?</h2>
            <p className="lp-lead">Start with Mantis free for 14 days.</p>
            <div className="lp-final-actions">
              <RouterLink className="lp-btn lp-btn-on-dark" to={ROUTES.trial} onClick={() => beginTrial()}>Start free trial</RouterLink>
              <a className="lp-btn lp-btn-on-dark-ghost" href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">Talk to sales</a>
            </div>
            <ul className="lp-trust-points">
              <li>No credit card required</li>
              <li>14-day free trial</li>
            </ul>
          </div>
        </section>
      </main>

      <footer id="contact" className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-logo">
                <LandingLogo withWordmark={false} />
              </div>
              <p>Properties. People. Progress.</p>
              <p>{CONTACT.address}</p>
              <p><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>
              <p><a href={`tel:${CONTACT.phoneTel}`}>{CONTACT.phoneDisplay}</a></p>
              <div className="lp-social">
                <a
                  className="lp-social-link"
                  href={CONTACT.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp Mantis Africa"
                >
                  <IconWhatsApp />
                </a>
              </div>
            </div>
            <div>
              <h3>Product</h3>
              <button type="button" onClick={() => selectFeature('ACCOUNTING')}>Accounting</button>
              <button type="button" onClick={() => selectFeature('PAYMENTS')}>Payments</button>
              <button type="button" onClick={() => selectFeature('LEASING')}>Leasing</button>
              <button type="button" onClick={() => selectFeature('MAINTENANCE')}>Maintenance</button>
              <button type="button" onClick={() => selectFeature('REPORTING')}>Reporting</button>
              <button type="button" onClick={() => selectFeature('SALES')}>CRM</button>
            </div>
            <div>
              <h3>Solutions</h3>
              <button type="button" onClick={() => { setPersona('landlord'); go('solutions'); }}>Landlords</button>
              <button type="button" onClick={() => { setPersona('manager'); go('solutions'); }}>Property Managers</button>
              <button type="button" onClick={() => go('solutions')}>Estate Agencies</button>
              <button type="button" onClick={() => go('solutions')}>Property Owners</button>
              <button type="button" onClick={() => go('solutions')}>Accountants</button>
            </div>
            <div>
              <h3>Resources</h3>
              <RouterLink to={ROUTES.demo}>Demo</RouterLink>
              <button type="button" onClick={() => go('faq')}>FAQs</button>
              <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">Support</a>
              <button type="button" onClick={() => go('start')}>Getting Started</button>
            </div>
            <div>
              <h3>Company</h3>
              <button type="button" onClick={() => go('zimbabwe')}>About</button>
              <button type="button" onClick={() => go('contact')}>Contact</button>
            </div>
            <div>
              <h3>Legal</h3>
              <button type="button" onClick={() => go('privacy')}>Privacy</button>
              <button type="button" onClick={() => go('terms')}>Terms</button>
              <button type="button" onClick={() => go('security')}>Security</button>
            </div>
          </div>

          <div className="lp-legal-grid">
            <div id="privacy" className="lp-legal">
              <h3>Privacy</h3>
              <p>
                Mantis Africa uses the account and property information you enter to provide the workspace. For privacy questions, email {CONTACT.email}.
              </p>
            </div>
            <div id="terms" className="lp-legal">
              <h3>Terms</h3>
              <p>
                Use of Mantis Africa is subject to your account and subscription. Contact {CONTACT.email} if you need a copy of current terms for your organisation.
              </p>
            </div>
          </div>
          <div className="lp-paynow">
            <PaynowBadge className="lp-paynow-badge" />
          </div>
          <p className="lp-copy">© {new Date().getFullYear()} Mantis Africa. All rights reserved. {CONTACT.city}.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
