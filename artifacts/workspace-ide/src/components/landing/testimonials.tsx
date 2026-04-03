import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'CTO, TechFlow',
    avatar: 'SC',
    content:
      'We migrated 200+ sites and saw an immediate 40% improvement in load times. The support team handled everything seamlessly.',
    rating: 5,
  },
  {
    name: 'Marcus Rodriguez',
    role: 'Founder, DevStack',
    avatar: 'MR',
    content:
      'The analytics dashboard alone is worth the price. We can finally see exactly what is happening across all our client sites.',
    rating: 5,
  },
  {
    name: 'Emily Watson',
    role: 'Lead Developer, PixelCraft',
    avatar: 'EW',
    content:
      'Best hosting experience we have ever had. Uptime has been flawless and the staging environment saves us hours every week.',
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className='py-24 px-6'>
      <div className='max-w-6xl mx-auto'>
        <div className='text-center mb-16'>
          <h2 className='text-3xl sm:text-4xl font-bold tracking-tight mb-4'>
            Loved by developers worldwide
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            Do not just take our word for it — hear from the teams who rely on us every day.
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className='p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all duration-300'
            >
              <div className='flex items-center gap-1 mb-4'>
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className='w-4 h-4 fill-yellow-400 text-yellow-400' />
                ))}
              </div>
              <p className='text-sm leading-relaxed text-muted-foreground mb-6'>
                &ldquo;{testimonial.content}&rdquo;
              </p>
              <div className='flex items-center gap-3'>
                <div className='w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary'>
                  {testimonial.avatar}
                </div>
                <div>
                  <p className='text-sm font-semibold'>{testimonial.name}</p>
                  <p className='text-xs text-muted-foreground'>{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
