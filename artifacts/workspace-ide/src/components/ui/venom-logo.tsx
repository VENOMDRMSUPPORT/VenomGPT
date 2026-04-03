import { motion } from 'framer-motion';
import cobraTechLogo from '@/assets/design2-cobra-tech.png';

export function VenomLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      animate={{
        filter: [
          'drop-shadow(0 0 4px rgba(138,43,226,0.25))',
          'drop-shadow(0 0 14px rgba(138,43,226,0.65)) drop-shadow(0 0 28px rgba(138,43,226,0.25))',
          'drop-shadow(0 0 4px rgba(138,43,226,0.25))',
        ],
      }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      whileHover={{
        rotate: [0, -3, 3, 0],
        filter: 'drop-shadow(0 0 24px rgba(138,43,226,0.9))',
      }}
    >
      <motion.img
        src={cobraTechLogo}
        alt="VenomGPT"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain' }}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

export function VenomLogoFull({ size = 80 }: { size?: number }) {
  return (
    <motion.div
      className="relative flex flex-col items-center gap-3 py-4 px-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <VenomLogo size={size} />
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex items-center">
          <motion.span
            style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', color: '#fff' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            VENOM
          </motion.span>
          <motion.span
            style={{ fontSize: 22, fontWeight: 300, letterSpacing: '0.08em', color: 'rgba(138,43,226,1)', marginLeft: 4 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          >
            GPT
          </motion.span>
        </div>
        <motion.div
          style={{ height: 3, borderRadius: 9999, background: 'linear-gradient(to right, rgba(138,43,226,1), rgba(0,255,255,0.6), transparent)' }}
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ delay: 0.7, duration: 0.6 }}
        />
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(138,43,226,1)' }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(161,161,170,0.7)', letterSpacing: '0.35em', textTransform: 'uppercase' }}>
            Cyber Intelligence
          </span>
          <motion.div
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(138,43,226,1)' }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
