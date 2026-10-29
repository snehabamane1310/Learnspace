import axios from 'axios';

export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://localhost:5000/api'});

api.interceptors.request.use(c=>{
  const t=localStorage.getItem('ls-token');
  if(t)c.headers.Authorization=`Bearer ${t}`;
  return c;
});

// expired login -> sign out and go to the login page
api.interceptors.response.use(r=>r,e=>{
  if(e.response?.status===401&&localStorage.getItem('ls-token')){
    localStorage.removeItem('ls-token');localStorage.removeItem('ls-user');
    location.assign('/login');
  }
  return Promise.reject(e);
});

export const err=e=>e.response?.data?.message||'Could not connect. Check that the server is running.';
