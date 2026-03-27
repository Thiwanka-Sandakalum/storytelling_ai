import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignIn, useSignUp } from '@clerk/react';

type VerificationTarget = 'signup' | 'signin' | null;

type FieldErrors = {
    email?: string;
    password?: string;
    confirmPassword?: string;
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const maybe = error as { errors?: Array<{ longMessage?: string; message?: string }> };
    return maybe?.errors?.[0]?.longMessage || maybe?.errors?.[0]?.message || fallback;
};

export const SignInOrUpFlow = () => {
    const navigate = useNavigate();
    const { signIn } = useSignIn();
    const { signUp } = useSignUp();

    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
    const [step, setStep] = useState<'credentials' | 'verify-email'>('credentials');
    const [verificationTarget, setVerificationTarget] = useState<VerificationTarget>(null);
    const [emailAddress, setEmailAddress] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const passwordChecks = {
        minLength: password.length >= 8,
        hasUpper: /[A-Z]/.test(password),
        hasLower: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
    };

    const validateCredentials = (): FieldErrors => {
        const nextErrors: FieldErrors = {};

        if (!emailAddress.trim()) {
            nextErrors.email = 'Email is required.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress.trim())) {
            nextErrors.email = 'Enter a valid email address.';
        }

        if (!password) {
            nextErrors.password = 'Password is required.';
        }

        if (authMode === 'signup') {
            if (!passwordChecks.minLength || !passwordChecks.hasUpper || !passwordChecks.hasLower || !passwordChecks.hasNumber) {
                nextErrors.password = 'Use at least 8 characters with upper, lower, and number.';
            }

            if (!confirmPassword) {
                nextErrors.confirmPassword = 'Please confirm your password.';
            } else if (password !== confirmPassword) {
                nextErrors.confirmPassword = 'Passwords do not match.';
            }
        }

        return nextErrors;
    };

    const navigateAfterAuth = ({ decorateUrl }: { decorateUrl: (value: string) => string }) => {
        const url = decorateUrl('/');
        if (url.startsWith('http')) {
            window.location.href = url;
            return;
        }
        navigate(url);
    };

    const onCredentialsSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const nextErrors = validateCredentials();
        setFieldErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        setSubmitting(true);
        setAuthError(null);

        try {
            if (authMode === 'signup') {
                const { error: signUpError } = await signUp.password({
                    emailAddress,
                    password,
                });

                if (signUpError) {
                    setAuthError(getApiErrorMessage(signUpError, 'Unable to start sign-up flow.'));
                    return;
                }

                await signUp.verifications.sendEmailCode();

                if (
                    signUp.status === 'missing_requirements' &&
                    signUp.unverifiedFields.includes('email_address') &&
                    signUp.missingFields.length === 0
                ) {
                    setVerificationTarget('signup');
                    setStep('verify-email');
                    return;
                }

                setAuthError('Sign-up could not continue. Please check your Clerk dashboard sign-up requirements.');
                return;
            }

            const { error } = await signIn.password({
                emailAddress,
                password,
            });

            if (error) {
                const codeValue = (error as { code?: string }).code;
                if (codeValue === 'form_identifier_not_found') {
                    setAuthError('No account found with this email. Switch to Sign Up to create one.');
                    return;
                }

                setAuthError(getApiErrorMessage(error, 'Unable to sign in.'));
                return;
            }

            if (signIn.status === 'complete') {
                await signIn.finalize({ navigate: navigateAfterAuth });
                return;
            }

            if (signIn.status === 'needs_client_trust') {
                const emailCodeFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === 'email_code');
                if (emailCodeFactor) {
                    await signIn.mfa.sendEmailCode();
                    setVerificationTarget('signin');
                    setStep('verify-email');
                    return;
                }
            }

            setAuthError('Sign-in attempt is not complete. Please check your account security settings.');
        } catch (error) {
            setAuthError(getApiErrorMessage(error, 'Unable to sign in.'));
        } finally {
            setSubmitting(false);
        }
    };

    const onGoogleContinue = async () => {
        setSubmitting(true);
        setAuthError(null);

        try {
            const { error } = await signIn.sso({
                strategy: 'oauth_google',
                redirectUrl: '/',
                redirectCallbackUrl: '/sso-callback',
            });

            if (error) {
                setAuthError(getApiErrorMessage(error, 'Google authentication failed.'));
            }
        } catch (error) {
            setAuthError(getApiErrorMessage(error, 'Google authentication failed.'));
        } finally {
            setSubmitting(false);
        }
    };

    const onVerifySubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        setSubmitting(true);
        setAuthError(null);

        try {
            if (verificationTarget === 'signup') {
                const { error } = await signUp.verifications.verifyEmailCode({ code });
                if (error) {
                    setAuthError(getApiErrorMessage(error, 'Invalid verification code.'));
                    return;
                }

                if (signUp.status === 'complete') {
                    await signUp.finalize({ navigate: navigateAfterAuth });
                    return;
                }

                setAuthError('Sign-up verification is not complete yet.');
                return;
            }

            if (verificationTarget === 'signin') {
                const { error } = await signIn.mfa.verifyEmailCode({ code });
                if (error) {
                    setAuthError(getApiErrorMessage(error, 'Invalid verification code.'));
                    return;
                }

                if (signIn.status === 'complete') {
                    await signIn.finalize({ navigate: navigateAfterAuth });
                    return;
                }

                setAuthError('Sign-in verification is not complete yet.');
                return;
            }

            setAuthError('No verification flow is active. Start over and try again.');
        } catch (error) {
            setAuthError(getApiErrorMessage(error, 'Invalid verification code.'));
        } finally {
            setSubmitting(false);
        }
    };

    const resendCode = async () => {
        setAuthError(null);

        try {
            if (verificationTarget === 'signup') {
                await signUp.verifications.sendEmailCode();
                return;
            }

            if (verificationTarget === 'signin') {
                await signIn.mfa.sendEmailCode();
                return;
            }

            setAuthError('No verification flow is active.');
        } catch (error) {
            setAuthError(getApiErrorMessage(error, 'Could not resend code.'));
        }
    };

    const resetFlow = () => {
        setStep('credentials');
        setVerificationTarget(null);
        setConfirmPassword('');
        setCode('');
        setAuthError(null);
        setFieldErrors({});
        signIn.reset();
    };

    return (
        <div className="w-full max-w-md rounded-3xl border border-outline-variant/20 bg-surface-container/40 backdrop-blur-xl p-8 text-center shadow-[0_0_40px_rgba(199,153,255,0.08)]">
            <h1 className="font-headline italic text-4xl text-primary mb-2">Magic Tale</h1>

            {step === 'credentials' ? (
                <>
                    <div className="mb-6 grid grid-cols-2 rounded-xl border border-outline-variant/20 bg-surface-container-high/40 p-1">
                        <button
                            type="button"
                            onClick={() => {
                                setAuthMode('signin');
                                setAuthError(null);
                                setFieldErrors({});
                            }}
                            className={`py-2 rounded-lg font-label text-[10px] uppercase tracking-widest transition-all ${authMode === 'signin'
                                ? 'bg-primary/20 text-primary'
                                : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setAuthMode('signup');
                                setAuthError(null);
                                setFieldErrors({});
                            }}
                            className={`py-2 rounded-lg font-label text-[10px] uppercase tracking-widest transition-all ${authMode === 'signup'
                                ? 'bg-primary/20 text-primary'
                                : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <p className="font-body text-on-surface-variant mb-8">
                        {authMode === 'signin' ? 'Sign in to continue to your workspace.' : 'Create your account to start using Magic Tale.'}
                    </p>

                    <button
                        type="button"
                        onClick={onGoogleContinue}
                        disabled={submitting}
                        className="w-full mb-5 px-4 py-3 rounded-xl border border-outline-variant/30 text-on-surface hover:border-outline-variant/60 transition-all font-label text-[11px] uppercase tracking-widest disabled:opacity-50"
                    >
                        Continue with Google
                    </button>

                    <div className="relative mb-5">
                        <div className="h-px bg-outline-variant/20" />
                        <span className="absolute left-1/2 -translate-x-1/2 -top-2 px-3 bg-surface-container/80 text-on-surface-variant/70 font-label text-[10px] uppercase tracking-widest">or</span>
                    </div>

                    <form onSubmit={onCredentialsSubmit} className="space-y-4 text-left">
                        <div>
                            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={emailAddress}
                                onChange={(event) => {
                                    setEmailAddress(event.target.value);
                                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                                }}
                                required
                                className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/25 text-on-background outline-none focus:border-primary/50"
                            />
                            {fieldErrors.email && (
                                <p className="mt-2 text-error text-xs font-body">{fieldErrors.email}</p>
                            )}
                        </div>

                        <div>
                            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2" htmlFor="password">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    setFieldErrors((prev) => ({ ...prev, password: undefined, confirmPassword: undefined }));
                                }}
                                required
                                className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/25 text-on-background outline-none focus:border-primary/50"
                            />
                            {fieldErrors.password && (
                                <p className="mt-2 text-error text-xs font-body">{fieldErrors.password}</p>
                            )}
                            {authMode === 'signup' && (
                                <ul className="mt-2 space-y-1">
                                    <li className={`text-xs font-body ${passwordChecks.minLength ? 'text-secondary' : 'text-on-surface-variant/70'}`}>
                                        • Minimum 8 characters
                                    </li>
                                    <li className={`text-xs font-body ${passwordChecks.hasUpper ? 'text-secondary' : 'text-on-surface-variant/70'}`}>
                                        • At least one uppercase letter
                                    </li>
                                    <li className={`text-xs font-body ${passwordChecks.hasLower ? 'text-secondary' : 'text-on-surface-variant/70'}`}>
                                        • At least one lowercase letter
                                    </li>
                                    <li className={`text-xs font-body ${passwordChecks.hasNumber ? 'text-secondary' : 'text-on-surface-variant/70'}`}>
                                        • At least one number
                                    </li>
                                </ul>
                            )}
                        </div>

                        {authMode === 'signup' && (
                            <div>
                                <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2" htmlFor="confirm-password">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(event) => {
                                        setConfirmPassword(event.target.value);
                                        setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                                    }}
                                    required
                                    className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/25 text-on-background outline-none focus:border-primary/50"
                                />
                                {fieldErrors.confirmPassword && (
                                    <p className="mt-2 text-error text-xs font-body">{fieldErrors.confirmPassword}</p>
                                )}
                                {!fieldErrors.confirmPassword && confirmPassword && (
                                    <p className={`mt-2 text-xs font-body ${confirmPassword === password ? 'text-secondary' : 'text-on-surface-variant/70'}`}>
                                        {confirmPassword === password ? 'Passwords match.' : 'Passwords must match.'}
                                    </p>
                                )}
                            </div>
                        )}

                        {authError && (
                            <p className="text-error text-xs font-body">{authError}</p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary transition-all font-label text-[11px] uppercase tracking-widest disabled:opacity-50"
                        >
                            {submitting ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    <div id="clerk-captcha" className="mt-4" />
                </>
            ) : (
                <>
                    <p className="font-body text-on-surface-variant mb-2">
                        {verificationTarget === 'signin'
                            ? 'Verify your email to finish sign in.'
                            : 'Verify your email to finish creating your account.'}
                    </p>
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-6">{emailAddress}</p>

                    <form onSubmit={onVerifySubmit} className="space-y-4 text-left">
                        <div>
                            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2" htmlFor="code">
                                Verification code
                            </label>
                            <input
                                id="code"
                                type="text"
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/25 text-on-background outline-none focus:border-primary/50"
                            />
                        </div>

                        {authError && (
                            <p className="text-error text-xs font-body">{authError}</p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary transition-all font-label text-[11px] uppercase tracking-widest disabled:opacity-50"
                        >
                            {submitting ? 'Verifying...' : 'Verify'}
                        </button>
                    </form>

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={resendCode}
                            className="px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50 transition-all font-label text-[10px] uppercase tracking-widest"
                        >
                            Resend code
                        </button>
                        <button
                            type="button"
                            onClick={resetFlow}
                            className="px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50 transition-all font-label text-[10px] uppercase tracking-widest"
                        >
                            Start over
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
