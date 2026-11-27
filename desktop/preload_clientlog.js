// Bridges the page's client log into the desktop host (ClientLog.Append).
//
// The page keeps its own IndexedDB copy (@gospeak/web utils/clientLog); this
// preload adds the host's copy, which is the only one readable after the
// WebView dies — the native crash window reads it. It also gives the page a
// cheap fatal-report path (ClientLog.ReportFatal) that does not depend on the
// page's own storage still working.
(() => {
	const runtime = window.mygo;
	if (!runtime) return;

	const MAX_ENTRIES = 1000;
	const queue = [];
	let flushing = false;

	const flush = async () => {
		if (flushing || queue.length === 0) return;
		flushing = true;
		while (queue.length > 0) {
			const entry = queue.shift();
			try {
				await runtime.call("ClientLog.Append", entry);
			} catch {
				// Host not ready yet, or the call was rejected: keep the entry
				// in the local ring so a later flush retries it.
				queue.unshift(entry);
				break;
			}
		}
		flushing = false;
	};

	// A failed host call must not loop forever; drop the oldest when the queue
	// outgrows the ring.
	const enqueue = (entry) => {
		queue.push(entry);
		if (queue.length > MAX_ENTRIES) queue.splice(0, queue.length - MAX_ENTRIES);
		void flush();
	};

	window.__gospeakHostLog = { enqueue };

	// The page's reporter calls this once it decides the failure is fatal.
	window.__gospeakReportFatal = (reason, detail) => {
		try {
			void runtime.call("ClientLog.ReportFatal", reason, detail || "");
		} catch {
			// Nothing left to do: the host window is the last resort.
		}
	};
})();
