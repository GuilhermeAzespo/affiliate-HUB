import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    isDanger: false
  });

  const confirm = useCallback(({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false }) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        isDanger,
        onConfirm: () => {
          setConfirmState(s => ({ ...s, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(s => ({ ...s, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {confirmState.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: '420px', animation: 'modal-in 0.2s ease-out', padding: '24px' }}>
            <h3 className="modal-title" style={{ marginBottom: '12px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {confirmState.isDanger && <span style={{ color: 'var(--c-danger)', fontSize: '20px' }}>⚠️</span>}
              {confirmState.title}
            </h3>
            <p style={{ color: 'var(--c-text-2)', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
              {confirmState.message}
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={confirmState.onCancel}>
                {confirmState.cancelText}
              </button>
              <button className={`btn ${confirmState.isDanger ? 'btn-danger' : 'btn-primary'}`} onClick={confirmState.onConfirm}>
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
