import Sidebar from './Sidebar';
import TopNav from './TopNav';

const Layout = ({ children }: { children: React.ReactNode }) => {
     return (
          <div className="flex min-h-screen bg-background text-on-background selection:bg-primary/30 antialiased font-body">
               <TopNav />
               <div className="flex pt-20 w-full h-screen">
                    <Sidebar />
                    <main className="flex-1 md:ml-64 relative h-full overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,_rgba(199,153,255,0.08)_0%,_transparent_50%)]">
                         {children}
                    </main>
               </div>
          </div>
     );
};

export default Layout;

