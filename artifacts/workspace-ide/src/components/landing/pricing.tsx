import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    price: '$9',
    period: '/month',
    description: 'Perfect for personal sites and small blogs.',
    features: [
      '1 Website',
      '10 GB NVMe Storage',
      'Free SSL Certificate',
      'Daily Backups',
      'Email Support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Professional',
    price: '$29',
    period: '/month',
    description: 'Ideal for growing businesses and online stores.',
    features: [
      'Unlimited Websites',
      '100 GB NVMe Storage',
      'Free SSL & CDN',
      'Priority Support',
      'Staging Environment',
      'Advanced Analytics',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    description: 'For high-traffic sites demanding peak performance.',
    features: [
      'Unlimited Websites',
      '500 GB NVMe Storage',
      'Dedicated Resources',
      '24/7 Phone Support',
      'Custom SSL & Firewall',
      'White-glove Migration',
      'SLA Guarantee',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section className='py-24 px-6 bg-muted/30'>
      <div className='max-w-6xl mx-auto'>
        <div className='text-center mb-16'>
          <h2 className='text-3xl sm:text-4xl font-bold tracking-tight mb-4'>
            Simple, transparent pricing
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            No hidden fees. No surprise charges. Pick a plan and start building today.
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8 items-start'>
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative p-8 rounded-2xl border bg-card transition-all duration-300 ${
                plan.popular
                  ? 'border-primary shadow-xl shadow-primary/10 scale-105'
                  : 'border-border hover:border-primary/30 hover:shadow-lg'
              }`}
            >
              {plan.popular && (
                <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                  <span className='px-4 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground'>
                    Most Popular
                  </span>
                </div>
              )}
              <div className='mb-6'>
                <h3 className='text-xl font-semibold mb-1'>{plan.name}</h3>
                <p className='text-sm text-muted-foreground'>{plan.description}</p>
              </div>
              <div className='mb-6'>
                <span className='text-4xl font-bold'>{plan.price}</span>
                <span className='text-muted-foreground'>{plan.period}</span>
              </div>
              <ul className='space-y-3 mb-8'>
                {plan.features.map((feature) => (
                  <li key={feature} className='flex items-center gap-2 text-sm'>
                    <Check className='w-4 h-4 text-primary flex-shrink-0' />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full rounded-xl py-5 ${
                  plan.popular
                    ? 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
