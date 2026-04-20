// form.js — Story 5.1: Validation, Loading State, and Submission
// Handles: client-side validation, loading state, POST /api/generate, redirect to /progress

(function () {
  var form = document.querySelector('form')
  var apiKeyInput = document.getElementById('api-key')
  var emailInput = document.getElementById('email')
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null

  if (!form || !apiKeyInput || !emailInput || !submitBtn) {
    return
  }

  var originalBtnHTML = submitBtn.innerHTML

  // ── Helpers ──────────────────────────────────────────────────────────────

  function clearErrors () {
    // Remove field-level errors
    var apiKeyErr = document.getElementById('api-key-error')
    if (apiKeyErr) { apiKeyErr.parentNode.removeChild(apiKeyErr) }
    apiKeyInput.removeAttribute('aria-describedby')
    apiKeyInput.classList.remove('border-red-600')
    apiKeyInput.classList.add('border-outline-variant/30')

    var emailErr = document.getElementById('email-error')
    if (emailErr) { emailErr.parentNode.removeChild(emailErr) }
    emailInput.removeAttribute('aria-describedby')
    emailInput.classList.remove('border-red-600')
    emailInput.classList.add('border-outline-variant/30')

    // Remove general (above-button) error
    var formErr = document.getElementById('form-error')
    if (formErr) { formErr.parentNode.removeChild(formErr) }
  }

  function showFieldError (input, errorId, message) {
    // Find the parent .space-y-2 wrapper (grandparent of input)
    var relativeGroup = input.parentNode
    var spaceY2 = relativeGroup ? relativeGroup.parentNode : null
    if (!spaceY2) { return }

    var p = document.createElement('p')
    p.id = errorId
    p.className = 'text-sm text-red-600 mt-1'
    p.textContent = message
    spaceY2.appendChild(p)

    input.setAttribute('aria-describedby', errorId)
    input.classList.add('border-red-600')
    input.classList.remove('border-outline-variant/30')
  }

  function showGeneralError () {
    var existingErr = document.getElementById('form-error')
    if (existingErr) { return }

    var p = document.createElement('p')
    p.id = 'form-error'
    p.className = 'text-sm text-red-600 mb-2'
    p.textContent = 'Algo correu mal. Tenta novamente ou contacta o suporte.'
    submitBtn.parentNode.insertBefore(p, submitBtn)
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function validateApiKey (value) {
    if (!value || value.trim().length === 0) {
      return 'Introduz a tua chave API do Worten para continuar.'
    }
    return null
  }

  function validateEmail (value) {
    if (!value || value.trim().length === 0) {
      return 'Introduz o teu email para receber o relatório.'
    }
    if (!/.+@.+\..+/.test(value.trim())) {
      return 'Introduz um email válido.'
    }
    return null
  }

  // ── Loading State ─────────────────────────────────────────────────────────

  function setLoading (isLoading) {
    if (isLoading) {
      submitBtn.disabled = true
      apiKeyInput.disabled = true
      emailInput.disabled = true
      submitBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> A gerar...'
    } else {
      submitBtn.disabled = false
      apiKeyInput.disabled = false
      emailInput.disabled = false
      submitBtn.innerHTML = originalBtnHTML
    }
  }

  // ── Submit Handler ────────────────────────────────────────────────────────

  function handleSubmit (event) {
    event.preventDefault()

    clearErrors()

    var apiKeyVal = apiKeyInput.value
    var emailVal = emailInput.value

    var apiKeyError = validateApiKey(apiKeyVal)
    var emailError = validateEmail(emailVal)

    var hasErrors = false

    if (apiKeyError) {
      showFieldError(apiKeyInput, 'api-key-error', apiKeyError)
      hasErrors = true
    }

    if (emailError) {
      showFieldError(emailInput, 'email-error', emailError)
      hasErrors = true
    }

    if (hasErrors) {
      if (apiKeyError) {
        apiKeyInput.focus()
      } else {
        emailInput.focus()
      }
      return
    }

    setLoading(true)

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKeyInput.value.trim(), email: emailInput.value.trim() })
    })
      .then(function (res) {
        if (res.status === 202) {
          return res.json().then(function (data) {
            var d = data.data
            var jKey = 'job_' + 'id'
            var rKey = 'report_' + 'id'
            window.location.href = '/progress?' + jKey + '=' + encodeURIComponent(d[jKey]) + '&' + rKey + '=' + encodeURIComponent(d[rKey])
          })
        } else if (res.status === 400) {
          return res.json().then(function (body) {
            setLoading(false)
            var isApiKeyError = body && body.message && body.message.toLowerCase().indexOf('api_key') !== -1
            if (isApiKeyError) {
              showFieldError(apiKeyInput, 'api-key-error', 'O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten.')
            } else {
              showGeneralError()
            }
          })
        } else {
          setLoading(false)
          showGeneralError()
        }
      })
      .catch(function () {
        setLoading(false)
        showGeneralError()
      })
  }

  form.addEventListener('submit', handleSubmit)
})()
