import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/api.js';
import { formatRelative } from '../../shared/utils/formatters.js';

/**
 * WoxSMS panel — SMS bridge showing messages and OTP codes.
 */
export default function SMSPanel() {
  const [messages, setMessages] = useState([]);
  const [devices, setDevices] = useState([]);
  const [activeTab, setActiveTab] = useState('messages');
  const [loading, setLoading] = useState(true);
  const [pairingName, setPairingName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [msgData, devData] = await Promise.all([
        apiFetch('/api/sms/messages?limit=20'),
        apiFetch('/api/sms/devices'),
      ]);
      setMessages(msgData.messages || []);
      setDevices(devData.devices || []);
    } catch (err) {
      console.error('Failed to load SMS data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePair() {
    if (!pairingName.trim()) return;
    try {
      const data = await apiFetch('/api/sms/devices/pair', {
        method: 'POST',
        body: JSON.stringify({ deviceName: pairingName.trim() }),
      });
      alert(`Pairing token: ${data.pairing.token}\n\nScan QR code or paste this token in the TextBee app.`);
      setPairingName('');
      loadData();
    } catch (err) {
      console.error('Failed to pair device:', err);
    }
  }

  async function handleUnpair(id) {
    if (!confirm('Unpair this device?')) return;
    try {
      await apiFetch(`/api/sms/devices/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to unpair:', err);
    }
  }

  function copyOTP(code) {
    navigator.clipboard.writeText(code);
  }

  return (
    <div className="sms-panel">
      <div className="sms-header">
        <h3>WoxSMS</h3>
        <div className="sms-tabs">
          <button
            className={`sms-tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >Messages</button>
          <button
            className={`sms-tab ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >Devices</button>
        </div>
      </div>

      {loading ? (
        <div className="sms-loading">Loading...</div>
      ) : activeTab === 'messages' ? (
        <div className="sms-messages">
          {messages.length === 0 ? (
            <div className="sms-empty">
              <p>No SMS messages yet</p>
              <p className="text-muted">Pair a phone to start receiving</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`sms-message ${msg.is_otp ? 'otp' : ''}`}>
                <div className="sms-sender">{msg.sender_phone}</div>
                <div className="sms-body">{msg.message_body}</div>
                {msg.is_otp && msg.otp_code && (
                  <button className="sms-otp-code" onClick={() => copyOTP(msg.otp_code)} title="Copy code">
                    {msg.otp_code} — tap to copy
                  </button>
                )}
                <div className="sms-time">{formatRelative(msg.received_at)}</div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="sms-devices">
          <div className="sms-pair-form">
            <input
              placeholder="Device name (e.g., My Pixel)"
              value={pairingName}
              onChange={(e) => setPairingName(e.target.value)}
              className="input-field"
            />
            <button className="btn btn-sm btn-primary" onClick={handlePair}>Pair</button>
          </div>

          {devices.length === 0 ? (
            <div className="sms-empty">No paired devices</div>
          ) : (
            devices.map((dev) => (
              <div key={dev.id} className="sms-device">
                <div className="sms-device-info">
                  <div className="sms-device-name">{dev.device_name}</div>
                  {dev.phone_number && <div className="sms-device-phone">{dev.phone_number}</div>}
                  <div className="sms-device-status">
                    {dev.is_active ? 'Active' : 'Inactive'}
                    {dev.last_synced_at && ` · Last sync ${formatRelative(dev.last_synced_at)}`}
                  </div>
                </div>
                <button className="sms-unpair" onClick={() => handleUnpair(dev.id)}>Unpair</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
