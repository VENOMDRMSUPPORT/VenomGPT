import { Shield, Zap, Globe, Headphones, Lock, BarChart3 } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'NVMe SSD storage with edge caching delivers sub-100ms response times globally.',
  },
  {
    icon: Shield,
    title: 'DDoS Protection',
    description: 'Enterprise-grade security with real-time threat detection and automatic mitigation.',
  },
  {
    icon: Globe,
    title: 'Global CDN',
    description: 'Content delivered from 200+ edge locations worldwide for optimal performance.',
  },
  {
    icon: Headphones,
    title: '24/7 Expert Support',
    description: 'Our team of hosting specialists is available around the clock to help you.',
  },
  {
    icon: Lock,
    title: 'Free SSL & Backups',
    description: 'Automatic SSL certificates and daily backups keep your site secure and recoverable.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Real-time insights into traffic, performance, and resource utilization.',
  },
];

export function FeaturesSection() {
  return (
    <section className='py-24 px-6'>
      <div className='max-w-6xl mx-auto'>
        <div className='text-center mb-16'>
          <h2 className='text-3xl sm:text-4xl font-bold tracking-tight mb-4'>
            Everything you need to succeed online
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            Powerful features designed to keep your websites fast, secure, and always available.
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {features.map((feature) => (
            <div
              key={feature.title}
              className='group p-6 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300'
            >
              <div className='w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors'>
                <feature.icon className='w-6 h-6 text-primary' />
              </div>
              <h3 className='text-lg font-semibold mb-2'>{feature.title}</h3>
              <p className='text-muted-foreground text-sm leading-relaxed'>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
