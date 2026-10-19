/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';

export function DownloadProgressBar({ percent }: { percent: number | null }) {
  return (
    <AnimatePresence>
      {percent !== null && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="fixed top-0 left-0 right-0 z-[200] h-1 bg-slate-800"
        >
          <motion.div
            className="h-full bg-indigo-500"
            initial={{ width: '0%' }}
            animate={{ width: `${percent}%` }}
            transition={{ ease: 'linear', duration: 0.3 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
