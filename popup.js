document.addEventListener('DOMContentLoaded', function() {
  const fileInput = document.getElementById('fileInput');
  const startButton = document.getElementById('startButton');
  const extractButton = document.getElementById('extractSubscriptions');
  const unsubscribeButton = document.getElementById('unsubscribeAll');
  const statusDiv = document.getElementById('status');
  const delayInput = document.getElementById('delayInput');
  
  let channels = [];

  // Extract subscriptions button click handler
  extractButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractSubscriptionURLs
      });
      
      if (results && results[0] && results[0].result) {
        const { urls, count } = results[0].result;
        const blob = new Blob([urls.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subscriptions.txt';
        a.click();
        URL.revokeObjectURL(url);
        
        statusDiv.textContent = `Downloaded ${count} subscription URLs`;
      }
    } catch (error) {
      console.error('Error extracting subscriptions:', error);
      statusDiv.textContent = 'Error extracting subscriptions. Make sure you are on YouTube subscriptions page.';
    }
  });

  // Unsubscribe all button click handler
  unsubscribeButton.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to unsubscribe from all channels? This action cannot be undone.')) {
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      statusDiv.textContent = 'Starting unsubscribe process...';

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: unsubscribeFromAllChannels
      });

      if (results && results[0] && results[0].result) {
        const { unsubscribed, total } = results[0].result;
        statusDiv.textContent = `Unsubscribed from ${unsubscribed} out of ${total} channels`;
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
      statusDiv.textContent = 'Error during unsubscribe process. Make sure you are on YouTube subscriptions page.';
    }
  });

  // File input handler
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
      const text = e.target.result;
      channels = text.split('\n')
        .map(url => url.trim())
        .filter(url => url.includes('youtube.com/@'));
      statusDiv.textContent = `Loaded ${channels.length} channels`;
    };

    reader.readAsText(file);
  });

  // Subscribe process handler
  startButton.addEventListener('click', async function() {
    if (channels.length === 0) {
      statusDiv.textContent = 'Please load a file first';
      return;
    }

    const delay = Math.max(3, parseInt(delayInput.value) || 5) * 1000;
    statusDiv.textContent = 'Starting subscription process...';
    
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (!channel) continue;

      try {
        statusDiv.textContent = `Processing channel ${i + 1}/${channels.length}...`;
        
        const tab = await chrome.tabs.create({ url: channel, active: false });
        await new Promise(resolve => setTimeout(resolve, delay));
        
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: subscribeToChannel,
          });
          
          if (result[0].result === true) {
            statusDiv.textContent = `Subscribed to ${i + 1}/${channels.length} channels`;
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          
          if (attempts === maxAttempts) {
            statusDiv.textContent = `Couldn't subscribe to channel ${i + 1}, moving to next...`;
          }
        }

        await chrome.tabs.remove(tab.id);
      } catch (error) {
        console.error('Error subscribing to channel:', error);
        statusDiv.textContent = `Error on channel ${i + 1}: ${error.message}`;
      }
    }

    statusDiv.textContent = 'Finished processing all channels!';
  });
});

// Function to extract subscription URLs
function extractSubscriptionURLs() {
  const channelURLs = new Set();
  
  document.querySelectorAll("#contents ytd-channel-renderer a").forEach((link) => {
    const channelURL = link.href;
    if (channelURL && channelURL.includes('@')) {
      channelURLs.add(channelURL);
    }
  });

  return {
    urls: Array.from(channelURLs),
    count: channelURLs.size
  };
}

// Function to subscribe to a channel
function subscribeToChannel() {
  try {
    const selectors = [
      'yt-button-shape button[aria-label*="Subscribe"]',
      '.yt-spec-button-shape-next:not([aria-label*="Subscribed"])',
      '#subscribe-button button:not([aria-label*="Subscribed"])',
      'ytd-subscribe-button-renderer button:not([aria-label*="Subscribed"])',
      '#subscribe button:not([aria-label*="Subscribed"])'
    ];

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      
      for (const button of buttons) {
        const buttonText = button.textContent.toLowerCase();
        const buttonLabel = (button.getAttribute('aria-label') || '').toLowerCase();

        if (
          (buttonText.includes('subscribe') && !buttonText.includes('subscribed')) ||
          (buttonLabel.includes('subscribe') && !buttonLabel.includes('subscribed'))
        ) {
          button.click();
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error in subscribeToChannel:', error);
    return false;
  }
}

// Function to unsubscribe from all channels
function unsubscribeFromAllChannels() {
  try {
    const unsubscribeSelectors = [
      'yt-button-shape button[aria-label*="Unsubscribe"]',
      '.yt-spec-button-shape-next[aria-label*="Unsubscribe"]',
      '#subscribe-button button[aria-label*="Unsubscribe"]',
      'ytd-subscribe-button-renderer button[aria-label*="Unsubscribe"]'
    ];

    let unsubscribeCount = 0;
    let totalChannels = 0;

    // Find all unsubscribe buttons
    for (const selector of unsubscribeSelectors) {
      const buttons = document.querySelectorAll(selector);
      totalChannels += buttons.length;
      
      buttons.forEach(button => {
        // Click unsubscribe button
        button.click();
        
        // Small delay to let the confirmation dialog appear
        setTimeout(() => {
          // Find and click the confirm button in the dialog
          const confirmButton = document.querySelector('yt-button-shape button[aria-label*="Unsubscribe"]');
          if (confirmButton) {
            confirmButton.click();
            unsubscribeCount++;
          }
        }, 500);
      });
    }

    return {
      unsubscribed: unsubscribeCount,
      total: totalChannels
    };
  } catch (error) {
    console.error('Error in unsubscribeFromAllChannels:', error);
    return { unsubscribed: 0, total: 0 };
  }
}