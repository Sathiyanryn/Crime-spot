export const getToken = () => sessionStorage.getItem('token');
export const getRole = () => sessionStorage.getItem('role');

export const setAuth = (token, role) => {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('role', role);
};

export const logout = () => {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('role');
  window.location.href = '/login';
};
