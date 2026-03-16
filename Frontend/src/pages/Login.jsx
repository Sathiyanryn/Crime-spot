import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { setAuth } from '../services/auth';

const getDestination = (role) => {
  if (role === 'admin') {
    return '/admin/dashboard';
  }

  if (role === 'patrol') {
    return '/patrol/dashboard';
  }

  return '/user/home';
};

const AuthPage = ({ defaultMode = 'login', setAuthState }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    phone: '',
    password: '',
    aadhar: '',
    name: '',
    role: 'user',
  });

  const isLogin = mode === 'login';

  const ctaLabel = useMemo(() => {
    if (loading) {
      return isLogin ? 'Signing in...' : 'Creating account...';
    }

    return isLogin ? 'Login' : 'Register';
  }, [isLogin, loading]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetNonLoginFields = () => {
    setForm((current) => ({
      ...current,
      aadhar: '',
      name: '',
      role: 'user',
    }));
  };

  const switchMode = (nextMode) => {
    setError('');
    setMode(nextMode);

    if (nextMode === 'login') {
      resetNonLoginFields();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await API.post('/login', {
          phone: form.phone,
          password: form.password,
        });

        const authPayload = {
          token: response.data.token,
          role: response.data.role,
          phone: form.phone,
          name: response.data.name || form.phone,
        };

        setAuth(authPayload);
        setAuthState((current) => ({
          ...current,
          ...authPayload,
          loading: false,
        }));
        navigate(getDestination(response.data.role), { replace: true });
      } else {
        await API.post('/register', {
          phone: form.phone,
          password: form.password,
          aadhar: form.aadhar,
          name: form.name,
        });

        setMode('login');
        setForm((current) => ({
          ...current,
          password: '',
          aadhar: '',
          name: '',
          role: 'user',
        }));
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel auth-panel--hero">
        <span className="eyebrow">Citizen Safety Network</span>
        <h1>CrimeSpot</h1>
        <p>
          Sign in with your phone number and land directly in the same role-based
          flow used by the mobile app: user safety tracking, patrol dispatch, or
          admin operations.
        </p>
        <div className="auth-highlights">
          <div>
            <strong>User</strong>
            <span>Live safety status, nearby crime map, and location updates.</span>
          </div>
          <div>
            <strong>Patrol</strong>
            <span>Real-time alerts with navigate, call, and mark-handled actions.</span>
          </div>
          <div>
            <strong>Admin</strong>
            <span>Overview, crimes, users, alerts, and response coordination.</span>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-panel--form">
        <div className="auth-toggle">
          <button
            type="button"
            className={isLogin ? 'is-active' : ''}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={!isLogin ? 'is-active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label>Phone Number</label>
            <input
              type="tel"
              placeholder="9876543210"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              required
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label>Aadhar Number</label>
                <input
                  type="text"
                  placeholder="123456789012"
                  value={form.aadhar}
                  onChange={(event) => updateField('aadhar', event.target.value)}
                  required
                />
              </div>

              <div>
                <label>Name</label>
                <input
                  type="text"
                  placeholder="Optional display name"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </div>

            </>
          )}

          {error ? <p className="form-error">{error}</p> : null}

          {!isLogin ? (
            <p className="form-hint">
              Public registration creates a standard `user` account. Patrol and admin accounts
              should be provisioned by an administrator.
            </p>
          ) : null}

          <button type="submit" className="primary-cta" disabled={loading}>
            {ctaLabel}
          </button>
        </form>

        <p className="auth-linkline">
          {isLogin ? "Need an account? " : 'Already registered? '}
          <Link to={isLogin ? '/register' : '/login'} onClick={() => switchMode(isLogin ? 'register' : 'login')}>
            {isLogin ? 'Create one here' : 'Return to login'}
          </Link>
        </p>
      </section>
    </div>
  );
};

const Login = ({ setAuthState }) => <AuthPage defaultMode="login" setAuthState={setAuthState} />;

export const RegisterScreen = ({ setAuthState }) => (
  <AuthPage defaultMode="register" setAuthState={setAuthState} />
);

export default Login;
