import { useSelector, useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import type { RootState } from '../../store';
import { removeNotification } from '../../store/slices/storySlice';
import { useEffect } from 'react';

const NotificationSystem = () => {
     const { notifications } = useSelector((state: RootState) => state.story);
     const dispatch = useDispatch();

     return (
          <div className="fixed top-8 right-8 z-[200] flex flex-col gap-4 w-80 pointer-events-none">
               <AnimatePresence>
                    {notifications.map((n) => (
                         <NotificationItem
                              key={n.id}
                              notification={n}
                              onClose={() => dispatch(removeNotification(n.id))}
                         />
                    ))}
               </AnimatePresence>
          </div>
     );
};

const NotificationItem = ({ notification, onClose }: { notification: any, onClose: () => void }) => {
     useEffect(() => {
          const timer = setTimeout(onClose, 5000);
          return () => clearTimeout(timer);
     }, [onClose]);

     const colors = {
          info: "bg-surface-container-high border-outline-variant text-on-surface",
          error: "bg-error-container border-error/20 text-on-error-container",
          success: "bg-primary/10 border-primary/20 text-primary"
     };

     return (
          <motion.div
               initial={{ opacity: 0, x: 20, scale: 0.95 }}
               animate={{ opacity: 1, x: 0, scale: 1 }}
               exit={{ opacity: 0, x: 20, scale: 0.95 }}
               className={`pointer-events-auto p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 ${colors[notification.type as keyof typeof colors]}`}
          >
               <span className="material-symbols-outlined text-lg mt-0.5">
                    {notification.type === 'error' ? 'report' : notification.type === 'success' ? 'check_circle' : 'info'}
               </span>
               <div className="flex-1">
                    <p className="text-xs font-label font-bold uppercase tracking-widest mb-1">
                         {notification.type}
                    </p>
                    <p className="text-sm font-body leading-relaxed">
                         {notification.message}
                    </p>
               </div>
               <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-sm">close</span>
               </button>
          </motion.div>
     );
};

export default NotificationSystem;
