import { Gauge, ArrowRight, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function HeroSection() {
  return (
    <section className='relative min-h-[90vh] flex items-center justify-center overflow-hidden'>
      <div className='absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10' />
      <div className='absolute inset-0 opacity-30'>
        <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse' />
        <div className='absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/15 rounded-full blur-[100px] animate-pulse [animation-delay:1s]' />
      </div>
      <div
        className='absolute inset-0 opacity-[0.03]'
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className='relative z-10 max-w-5xl mx-auto px-6 text-center'>
        <Badge
          variant='secondary'
          className='mb-6 px-4 py-1.5 text-sm font-medium border border-primary/30 bg-primary/10 text-primary-foreground'
        >
          <Gauge className='w-3.5 h-3.5 mr-1.5' />
          Trusted by 12,000+ businesses worldwide
        </Badge>
        <h1 className='text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6'>
          Hosting that{' '}
          <span className='bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent'>
            never lets you down
          </span>
        </h1>
        <p className='text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed'>
          Enterprise-grade infrastructure with intelligent monitoring, automated
          scaling, and expert support — so you can focus on building, not
          babysitting servers.
        </p>
        <div className='flex flex-col sm:flex-row items-center justify-center gap-4'>
          <Button
            size='lg'
            className='px-8 py-6 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25'
          >
            Start Free Trial
            <ArrowRight className='ml-2 w-4 h-4' />
          </Button>
          <Button
            size='lg'
            variant='outline'
            className='px-8 py-6 text-base font-semibold rounded-xl border-border hover:bg-secondary'
          >
            View Live Demo
          </Button>
        </div>
        <div className='mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground text-sm'>
          <span className='flex items-center gap-2'>
            <CircleCheck className='w-4 h-4 text-success' /> 99.99% Uptime SLA
          </span>
          <span className='flex items-center gap-2'>
            <CircleCheck className='w-4 h-4 text-success' /> 30-Day Money Back
          </span>
          <span className='flex items-center gap-2'>
            <CircleCheck className='w-4 h-4 text-success' /> Free Migration
          </span>
          <span className='flex items-center gap-2'>
            <CircleCheck className='w-4 h-4 text-success' /> No Credit Card Required
          </span>
        </div>
      </div>
    </section>
  );
}
