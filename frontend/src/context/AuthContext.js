"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [authChecking, setAuthChecking] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Check if user is logged in (via cookie or token)
        const checkLogin = async () => {
            try {
                const res = await fetch('http://localhost:8000/api/auth/me', { credentials: 'include' });
                if (res.ok) {
                    const userData = await res.json();
                    setUser(userData);
                }
            } catch (err) {
                console.error("Auth check failed", err);
            } finally {
                setAuthChecking(false);
            }
        };
        checkLogin();
    }, []);

    const login = async (email, password) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('http://localhost:8000/api/auth/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Login failed');

            setUser(data);
            router.push('/journal');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        } finally {
            setIsSubmitting(false);
        }
    };

    const signup = async (userData) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('http://localhost:8000/api/auth/signup', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `${userData.firstName} ${userData.lastName}`.trim(),
                    email: userData.email,
                    password: userData.password
                }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Signup failed');

            setUser(data);
            router.push('/journal');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        } finally {
            setIsSubmitting(false);
        }
    };

    const logout = async () => {
        try {
            await fetch('http://localhost:8000/api/auth/logout', { 
                method: 'POST',
                credentials: 'include'
            });
        } catch (err) {
            console.error("Logout failed", err);
        }
        setUser(null);
        // Direct location change ensures all state is cleared and cookie path matches
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            authChecking, 
            isSubmitting, 
            login, 
            signup, 
            logout 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
