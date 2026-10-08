import React, { useState } from 'react';
import { linkLabel, normalizeUrl } from './profileFields';

const INITIAL_VISIBLE = 5;

const sectionStyle = {
  marginBottom: '24px',
  textAlign: 'left',
  maxWidth: '640px',
  marginLeft: 'auto',
  marginRight: 'auto',
};

const cardStyle = {
  border: '1px solid #000',
  borderRadius: '4px',
  padding: '12px 14px',
  marginBottom: '10px',
  backgroundColor: '#fff',
};

const expandBtnStyle = {
  backgroundColor: '#fff',
  color: '#000',
  border: '1px solid #000',
  padding: '8px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  width: '100%',
};

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: '100px', border: '1px solid #000', padding: '10px', borderRadius: '4px' }}>
      <div style={{ fontSize: '22px', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#333' }}>{label}</div>
    </div>
  );
}

function Breakdown({ title, counts }) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div style={sectionStyle}>
      <h3 style={{ fontSize: '16px', margin: '0 0 10px', fontWeight: 600 }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px' }}>
        {entries.slice(0, 6).map(([label, count]) => (
          <li key={label}>
            <strong>{label}</strong> — {count}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectionCard({ item }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px' }}>{item.name}</div>
        <span
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            border: '1px solid #000',
            padding: '2px 6px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {item.kind === 'direct' ? 'Met' : 'Follow-up'}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: '#333', marginTop: '4px' }}>
        {[item.school, item.role].filter(Boolean).join(' · ') || '—'}
      </div>
      {item.detail && (
        <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>{item.detail}</div>
      )}
      {item.email && (
        <div style={{ fontSize: '13px', marginTop: '6px' }}>
          <a href={`mailto:${item.email}`} style={{ color: '#000' }}>
            {item.email}
          </a>
        </div>
      )}
      {item.website && (
        <div style={{ fontSize: '13px', marginTop: '4px' }}>
          <a href={normalizeUrl(item.website)} target="_blank" rel="noopener noreferrer" style={{ color: '#000' }}>
            {linkLabel(normalizeUrl(item.website))}
          </a>
        </div>
      )}
    </div>
  );
}

export default function ParticipantInsightsPanel({ insights, loading, error, viewerName, onExploreGraph }) {
  const [showAllConnections, setShowAllConnections] = useState(false);

  if (loading) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center', color: '#000' }}>
        Loading your connections…
      </div>
    );
  }

  if (!viewerName) {
    return (
      <div style={{ ...sectionStyle, padding: '24px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '20px', marginTop: 0 }}>Your event recap</h2>
        <p style={{ color: '#333', fontSize: '15px' }}>
          Tap your NFC card and choose <strong>Yes, this is my card</strong> (or complete setup) so this phone
          knows who you are. Then you will see the connections you made here.
        </p>
        {onExploreGraph && (
          <button type="button" onClick={onExploreGraph} style={{ marginTop: '12px' }}>
            Browse full network
          </button>
        )}
      </div>
    );
  }

  if (error === 'load_failed') {
    return (
      <div style={{ ...sectionStyle, padding: '24px 20px', textAlign: 'center' }}>
        <p style={{ color: '#333' }}>Could not load your connections. Check your connection and try again.</p>
      </div>
    );
  }

  if (error === 'profile_not_found') {
    return (
      <div style={{ ...sectionStyle, padding: '24px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '20px', marginTop: 0 }}>Profile not found</h2>
        <p style={{ color: '#333' }}>
          This phone is set to <strong>{viewerName}</strong>, but that name is not in the event database yet.
          Try resetting the phone and tapping your card again, or use the graph to find your node.
        </p>
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  const { me, directPeers, schoolCounts, roleCounts, extendedCount, suggestions, summaryLine } = insights;

  const direct = directPeers.map((p) => ({
    kind: 'direct',
    name: p.name,
    school: p.school,
    role: p.role,
    email: p.email,
    website: p.website,
    detail: p.viaLabel,
  }));
  const followUps = suggestions.map((s) => ({
    kind: 'suggest',
    name: s.name,
    school: s.school,
    role: s.role,
    email: s.email,
    website: s.website,
    detail: s.reasons.slice(0, 2).join(' · '),
  }));
  const allConnections = [...followUps, ...direct];

  const visibleConnections = showAllConnections
    ? allConnections
    : allConnections.slice(0, INITIAL_VISIBLE);
  const hiddenCount = allConnections.length - INITIAL_VISIBLE;

  return (
    <div
      style={{
        padding: '16px 16px 80px',
        color: '#000',
        backgroundColor: '#fff',
        minHeight: '60vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ ...sectionStyle, textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', margin: '0 0 8px', fontWeight: 700 }}>{me.name}</h2>
        {(me.school || me.role) && (
          <p style={{ margin: 0, fontSize: '14px', color: '#444' }}>
            {[me.school, me.role].filter(Boolean).join(' · ')}
          </p>
        )}
        <p style={{ fontSize: '15px', lineHeight: 1.5, margin: '16px 0 0', color: '#111' }}>{summaryLine}</p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          justifyContent: 'center',
          maxWidth: '640px',
          margin: '0 auto 24px',
        }}
      >
        <Stat label="Direct connections" value={directPeers.length} />
        <Stat label="Extended network" value={extendedCount} />
        <Stat label="Schools in your circle" value={Object.keys(schoolCounts).length} />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '16px', margin: '0 0 4px', fontWeight: 600 }}>Your connections</h3>
        <p style={{ fontSize: '13px', color: '#444', marginTop: 0, marginBottom: '12px' }}>
          People you met at the event, plus suggested follow-ups from your network.
        </p>
        {allConnections.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#444' }}>No taps recorded yet for this profile.</p>
        ) : (
          <>
            {visibleConnections.map((item) => (
              <ConnectionCard key={`${item.kind}-${item.name}`} item={item} />
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                style={expandBtnStyle}
                onClick={() => setShowAllConnections((v) => !v)}
              >
                {showAllConnections
                  ? 'Show fewer'
                  : `View ${hiddenCount} more connection${hiddenCount === 1 ? '' : 's'}`}
              </button>
            )}
          </>
        )}
      </div>

      <Breakdown title="Schools in your connections" counts={schoolCounts} />
      <Breakdown title="Roles in your connections" counts={roleCounts} />

      {onExploreGraph && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onExploreGraph}
            style={{
              backgroundColor: '#000',
              color: '#fff',
              border: '1px solid #000',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Open network graph
          </button>
        </div>
      )}
    </div>
  );
}
