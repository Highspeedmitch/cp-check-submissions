self.addEventListener('push', event => {
    let data = {};
    if (event.data) {
      data = event.data.json();
    }
    const title = data.title || 'New Assignment';
    const options = {
      body: data.body || 'You have a new property inspection assignment.',
      icon: '/icon.png',    // Replace with your notification icon
      badge: '/badge.png'   // Replace with your badge icon if needed
    };
  
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  });
  