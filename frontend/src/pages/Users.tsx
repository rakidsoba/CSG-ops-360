import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  roles: { id: string; name: string }[];
}

export function Users() {
  const { can, user: me } = useAuth();
  const [data, setData] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<{ data: UserRow[] }>('/users'),
      api.get<{ data: { id: string; name: string }[] }>('/roles'),
    ])
      .then(([u, r]) => {
        setData(u.data);
        setRoles(r.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const grantRole = async (userId: string, roleId: string) => {
    try {
      await api.post(`/users/${userId}/roles/${roleId}`, {});
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const revokeRole = async (userId: string, roleId: string) => {
    try {
      await api.del(`/users/${userId}/roles/${roleId}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <SkeletonTable rows={6} />;

  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: 'var(--color-primary)' }}>Users & Access</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Super Admin can grant additional roles to any user. Permissions take effect on the next request — no re-login required.
      </p>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px' }}>Name</th>
              <th style={{ padding: '12px 16px' }}>Email</th>
              <th style={{ padding: '12px 16px' }}>Roles</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              {can('users:update') && <th style={{ padding: '12px 16px' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 16px' }}>{u.full_name}</td>
                <td style={{ padding: '12px 16px' }}>{u.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  {u.roles.map((r) => (
                    <span
                      key={r.id}
                      style={{
                        display: 'inline-block',
                        marginRight: 6,
                        marginBottom: 4,
                        padding: '2px 8px',
                        background: 'var(--color-bg)',
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      {r.name}
                      {can('users:update') && me?.id !== u.id && (
                        <button
                          onClick={() => revokeRole(u.id, r.id)}
                          style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 11 }}
                          title="Revoke"
                        >
                          x
                        </button>
                      )}
                    </span>
                  ))}
                </td>
                <td style={{ padding: '12px 16px' }}>{u.is_active ? 'Active' : 'Inactive'}</td>
                {can('users:update') && (
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          grantRole(u.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{ padding: '4px 8px', fontSize: 13 }}
                    >
                      <option value="">Grant role...</option>
                      {roles
                        .filter((r) => !u.roles.some((ur) => ur.id === r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
