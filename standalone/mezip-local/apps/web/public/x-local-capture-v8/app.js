(() => {
  const dialog = document.querySelector('#capture-dialog');

  document.querySelectorAll('[data-close-capture-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog) return;
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    });
  });
})();
