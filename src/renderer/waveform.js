function waveformColumns(peaks, width) {
  const columns = [];
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(x * peaks.length / width);
    const end = Math.min(peaks.length, Math.max(start + 1, Math.floor((x + 1) * peaks.length / width)));
    let maximum = 0;
    for (let index = start; index < end; index += 1) {
      maximum = Math.max(maximum, Math.max(0, Math.min(1, Number(peaks[index]) || 0)));
    }
    columns.push(maximum);
  }
  return columns;
}

function drawWaveform(canvas, peaks, type = "waveform", displayGain = 1) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = type === "chord" || type === "lyrics" ? "#10151c" : "#080c11";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(148, 163, 184, 0.14)";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const mid = height / 2;
  context.strokeStyle = type === "chord" ? "rgba(148, 163, 184, 0.2)" : type === "lyrics" ? "rgba(246, 198, 91, 0.24)" : "rgba(53, 217, 187, 0.22)";
  context.beginPath();
  context.moveTo(0, mid);
  context.lineTo(width, mid);
  context.stroke();

  if (type === "chord" || type === "lyrics" || !peaks.length) {
    return;
  }

  // Aggregate to screen columns so zooming out never discards a short transient.
  const columns = waveformColumns(peaks, width);
  const gain = Math.max(.25, Math.min(8, Number(displayGain) || 1));
  context.fillStyle = "#269b8a";
  columns.forEach((peak, x) => {
    const amplitude = Math.min(1, peak * gain) * (mid - 3);
    if (amplitude > 0) context.fillRect(x, mid - amplitude, 1, amplitude * 2);
  });
  context.fillStyle = "#62dcc6";
  columns.forEach((peak, x) => {
    const amplitude = Math.min(1, peak * gain) * (mid - 3);
    if (amplitude > 0) {
      context.fillRect(x, mid - amplitude, 1, 1);
      context.fillRect(x, mid + amplitude - 1, 1, 1);
    }
  });
}

