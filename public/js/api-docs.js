/**
 * WoxMail Developer API Portal Client Engine
 */

async function loadApiReference() {
  const contentArea = document.getElementById('contentArea');
  try {
    const res = await fetch('/api/docs/openapi.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const spec = await res.json();
    renderPortal(spec);
  } catch (e) {
    if (contentArea) {
      contentArea.innerHTML = '<div style="color:var(--color-error); padding: 2rem;">Failed to load API specification: ' + e.message + '</div>';
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPortal(spec) {
  const sidebarNav = document.getElementById('sidebarNav');
  const contentArea = document.getElementById('contentArea');
  if (!sidebarNav || !contentArea) return;

  const tagsMap = {};

  for (const path in (spec.paths || {})) {
    const methods = spec.paths[path];
    for (const method in methods) {
      const op = methods[method];
      const tag = (op.tags && op.tags[0]) || 'General';
      if (!tagsMap[tag]) tagsMap[tag] = [];
      tagsMap[tag].push(Object.assign({ path: path, method: method }, op));
    }
  }

  sidebarNav.innerHTML = '';
  contentArea.innerHTML = '';

  for (const tag in tagsMap) {
    const endpoints = tagsMap[tag];
    const groupTitle = document.createElement('div');
    groupTitle.className = 'nav-group-title';
    groupTitle.textContent = tag;
    sidebarNav.appendChild(groupTitle);

    endpoints.forEach(function(ep) {
      const cardId = ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-zA-Z0-9]/g, '-');

      const navItem = document.createElement('a');
      navItem.className = 'nav-item';
      navItem.href = '#' + cardId;
      navItem.innerHTML = '<span class="method-tag method-' + ep.method.toLowerCase() + '">' + ep.method.toUpperCase() + '</span> <span>' + escapeHtml(ep.summary || ep.path) + '</span>';
      sidebarNav.appendChild(navItem);

      // Card Element
      const card = document.createElement('div');
      card.className = 'endpoint-card';
      card.id = cardId;

      let paramsHtml = '';
      if (ep.parameters && ep.parameters.length) {
        paramsHtml = '<div class="section-title">Query Parameters</div><table><thead><tr><th>Parameter</th><th>In</th><th>Required</th><th>Description</th></tr></thead><tbody>' +
          ep.parameters.map(function(p) {
            return '<tr><td><span class="mono-pill">' + escapeHtml(p.name) + '</span></td><td>' + escapeHtml(p.in) + '</td><td>' + (p.required ? '<b>Yes</b>' : 'No') + '</td><td>' + escapeHtml(p.description || '-') + '</td></tr>';
          }).join('') +
          '</tbody></table>';
      }

      let bodyHtml = '';
      if (ep.requestBody && ep.requestBody.content) {
        const schema = ep.requestBody.content['application/json']?.schema?.properties || {};
        bodyHtml = '<div class="section-title">Request Body (JSON)</div><div class="code-block"><pre>' + escapeHtml(JSON.stringify(schema, null, 2)) + '</pre></div>';
      }

      let responseHtml = '';
      if (ep.responses) {
        const success200 = ep.responses['200'] || ep.responses['201'];
        if (success200 && success200.content) {
          const example = success200.content['application/json']?.example;
          responseHtml = '<div class="section-title">Response Example (' + (ep.responses['201'] ? '201 Created' : '200 OK') + ')</div><div class="code-block"><pre>' + escapeHtml(JSON.stringify(example || {}, null, 2)) + '</pre></div>';
        }
      }

      const curlSnippet = 'curl -X ' + ep.method.toUpperCase() + ' "https://mail.wox.world' + ep.path + '" \\\n  -H "Authorization: Bearer <token>"';

      card.innerHTML = 
        '<div class="endpoint-header">' +
          '<span class="method-tag method-' + ep.method.toLowerCase() + '">' + ep.method.toUpperCase() + '</span>' +
          '<span class="endpoint-path">' + escapeHtml(ep.path) + '</span>' +
        '</div>' +
        '<div class="endpoint-title">' + escapeHtml(ep.summary || '') + '</div>' +
        '<div class="endpoint-desc">' + escapeHtml(ep.description || '') + '</div>' +
        paramsHtml +
        bodyHtml +
        responseHtml +
        '<div class="section-title">Example cURL</div>' +
        '<div class="code-block"><pre>' + escapeHtml(curlSnippet) + '</pre></div>';

      contentArea.appendChild(card);
    });
  }

  // Search filter
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('.nav-item').forEach(function(item) {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'flex' : 'none';
      });
      document.querySelectorAll('.endpoint-card').forEach(function(card) {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? 'block' : 'none';
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadApiReference);
} else {
  loadApiReference();
}
