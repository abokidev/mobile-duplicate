/* Progressive enhancement for the selection page.
   Core flow works without JavaScript (NFR: graceful degradation):
     - positions are real <input type="radio"> inside a normal <form>
     - the server rejects a submit with no selection and re-renders
   With JS we add: instant selected-state styling and disable-until-chosen. */
(function () {
  'use strict';
  var form = document.querySelector('[data-selection-form]');
  if (!form) return;

  var radios = Array.prototype.slice.call(form.querySelectorAll('input[type="radio"][name="positionId"]'));
  var submit = form.querySelector('[data-confirm]');
  var cards = Array.prototype.slice.call(form.querySelectorAll('.pos'));

  function sync() {
    var anyChecked = false;
    cards.forEach(function (card) {
      var input = card.querySelector('input[type="radio"]');
      var on = input && input.checked;
      card.classList.toggle('is-selected', !!on);
      if (on) anyChecked = true;
    });
    if (submit) {
      submit.disabled = !anyChecked;
      submit.setAttribute('aria-disabled', anyChecked ? 'false' : 'true');
    }
  }

  radios.forEach(function (r) {
    r.addEventListener('change', sync);
  });

  // Only take over the disabled-state once JS is confirmed running.
  if (submit) {
    submit.disabled = true;
    submit.setAttribute('aria-disabled', 'true');
  }
  sync();

  // Guard against accidental double-submit on the final confirm step.
  var finalForm = document.querySelector('[data-final-form]');
  if (finalForm) {
    finalForm.addEventListener('submit', function () {
      var btn = finalForm.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.textContent = 'Recording your selection…';
      }
    });
  }
})();
