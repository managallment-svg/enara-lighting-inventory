import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { User, Lock, LogIn } from 'lucide-react';
import brandLogoFull from '../assets/brand-logo-full.png';

export default function Login() {
  const { user, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#00332e]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#00bfa5] border-t-transparent"></div>
      </div>
    );
  }

  if (user && profile) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/user'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Auth error", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('هذا الدومين غير مفعّل بعد داخل Firebase Authentication. يرجى إضافة دومين GitHub Pages إلى Authorized Domains.');
      } else {
        setError('حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-[#f4f7f6] p-3 sm:p-4 font-sans" dir="rtl">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white rounded-3xl overflow-hidden">
        <CardHeader className="bg-[#004d40] pb-4 pt-6 text-center sm:pb-6 sm:pt-8">
          <div className="mx-auto mb-4 rounded-[24px] bg-white/95 p-2.5 shadow-xl shadow-black/10 sm:mb-5 sm:rounded-[28px] sm:p-3">
            <img
              src={brandLogoFull}
              alt="شعار إنارة ستوك"
              className="h-auto w-36 max-w-full sm:w-44 md:w-48"
            />
          </div>
          <CardTitle className="mb-2 text-xl font-black tracking-wider text-white sm:text-2xl">
            إدارة مخازن إنارة
          </CardTitle>
          <CardDescription className="text-sm font-medium text-white/80">
            مرحباً بك، قم بتسجيل الدخول للمتابعة
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100 text-center">
                {error}
              </div>
            )}
            
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">اسم المستخدم أو البريد الإلكتروني</label>
              <div className="relative flex items-center">
                <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center border-l border-gray-200 text-[#00bfa5] bg-gray-50 rounded-r-xl z-10">
                  <User className="h-5 w-5" />
                </div>
                <Input 
                  type="email" 
                  required 
                  placeholder="أدخل اسم المستخدم أو البريد"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-right bg-white text-gray-900 border border-gray-200 h-12 rounded-xl pr-14 pl-4 focus-visible:ring-2 focus-visible:ring-[#00bfa5] w-full placeholder:text-gray-400"
                  dir="rtl"
                />
              </div>
            </div>
            
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">كلمة المرور</label>
              <div className="relative flex items-center">
                <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center border-l border-gray-200 text-[#00bfa5] bg-gray-50 rounded-r-xl z-10">
                  <Lock className="h-5 w-5" />
                </div>
                <Input 
                  type="password" 
                  required 
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-right bg-white text-gray-900 border border-gray-200 h-12 rounded-xl pr-14 pl-4 focus-visible:ring-2 focus-visible:ring-[#00bfa5] w-full placeholder:text-gray-400"
                  dir="rtl"
                />
              </div>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <input type="checkbox" id="remember" className="rounded border-gray-300 text-[#00bfa5] focus:ring-[#00bfa5] h-4 w-4" />
              <label htmlFor="remember" className="text-sm font-medium text-gray-600 cursor-pointer">تذكرني</label>
            </div>

            <Button type="submit" className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00bfa5] text-lg font-bold text-white shadow-lg shadow-[#00bfa5]/30 transition-colors hover:bg-[#00a68f]" disabled={isSubmitting}>
              <LogIn className="h-5 w-5" />
              {isSubmitting ? 'جاري التحميل...' : 'تسجيل الدخول'}
            </Button>
          </form>
          
          <div className="mt-6 text-center sm:mt-8">
            <p className="text-xs text-gray-400 font-medium">
              جميع الحقوق محفوظة لدى شركة إنارة للمشروعات - 2026
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
