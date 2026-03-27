
import { NavLink } from 'react-router-dom';
import { Show, UserButton } from '@clerk/react';

const DotIcon = () => (
     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z" />
     </svg>
);

const TopNav = () => {
     return (
          <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-8 h-20 bg-[#131027]/40 backdrop-blur-xl border-b border-[#48455c]/15 shadow-[0_0_40px_rgba(199,153,255,0.06)]">
               <div className="flex items-center gap-4 md:gap-8 min-w-0">
                    <NavLink to="/" className="flex items-center gap-3 min-w-0">
                         <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-primary text-base">auto_fix_high</span>
                         </div>
                         <div className="min-w-0">
                              <h3 className="font-headline text-[#c799ff] text-xl md:text-2xl leading-none italic truncate">Magic Tale</h3>
                              <p className="hidden sm:block font-label text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase mt-1 truncate">AI Storyteller</p>
                         </div>
                    </NavLink>
                    <div className="flex md:hidden gap-5 items-center">
                         <NavLink
                              to="/"
                              end
                              className={({ isActive }) =>
                                   `font-label uppercase tracking-widest text-[10px] pb-1 border-b-2 transition-colors ${isActive ? 'text-primary border-primary' : 'text-on-surface/60 border-transparent hover:text-on-surface'
                                   }`
                              }
                         >
                              The Forge
                         </NavLink>
                         <NavLink
                              to="/library"
                              className={({ isActive }) =>
                                   `font-label uppercase tracking-widest text-[10px] pb-1 border-b-2 transition-colors ${isActive ? 'text-primary border-primary' : 'text-on-surface/60 border-transparent hover:text-on-surface'
                                   }`
                              }
                         >
                              Library
                         </NavLink>
                    </div>
               </div>

               <div className="flex items-center gap-2 md:gap-4 shrink-0">
                    <button className="hidden md:flex p-2 rounded-full hover:bg-primary/10 transition-all text-primary items-center justify-center">
                         <span className="material-symbols-outlined">auto_awesome</span>
                    </button>
                    <button className="p-2 rounded-full hover:bg-primary/10 transition-all text-on-surface/60 flex items-center justify-center">
                         <span className="material-symbols-outlined">notifications</span>
                    </button>

                    <Show when="signed-in">
                         <div className="rounded-full border border-primary/20 overflow-hidden bg-surface-container-high p-0.5">
                              <UserButton>
                                   <UserButton.MenuItems>
                                        <UserButton.Action label="signOut" />
                                        <UserButton.Link
                                             label="Go to Library"
                                             href="/library"
                                             labelIcon={<DotIcon />}
                                        />
                                        <UserButton.Action
                                             label="Open Help"
                                             open="help"
                                             labelIcon={<DotIcon />}
                                        />
                                        <UserButton.Action label="manageAccount" />
                                   </UserButton.MenuItems>

                                   <UserButton.UserProfilePage label="Help" url="help" labelIcon={<DotIcon />}>
                                        <div className="space-y-3 p-1">
                                             <h2 className="font-headline italic text-2xl text-on-background">Need help?</h2>
                                             <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                                                  Start with The Forge to generate a story, open Library to manage items, and use Narrator Studio to perform playback.
                                             </p>
                                        </div>
                                   </UserButton.UserProfilePage>

                                   <UserButton.UserProfilePage label="Release Notes" url="release-notes" labelIcon={<DotIcon />}>
                                        <div className="space-y-3 p-1">
                                             <h2 className="font-headline italic text-2xl text-on-background">Release Notes</h2>
                                             <ul className="font-body text-sm text-on-surface-variant leading-relaxed list-disc pl-5 space-y-1">
                                                  <li>Custom sign-in / sign-up flow with Google OAuth.</li>
                                                  <li>Improved Library async states and status badges.</li>
                                                  <li>Enhanced responsive navigation and layout consistency.</li>
                                             </ul>
                                        </div>
                                   </UserButton.UserProfilePage>

                                   <UserButton.UserProfileLink
                                        label="Homepage"
                                        url="/"
                                        labelIcon={<DotIcon />}
                                   />
                                   <UserButton.UserProfilePage label="account" />
                                   <UserButton.UserProfilePage label="security" />
                              </UserButton>
                         </div>
                    </Show>
               </div>
          </nav>
     );
};

export default TopNav;
