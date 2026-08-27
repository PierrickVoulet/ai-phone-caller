class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.port.onmessage = (event) => {
      // Receive Int16Array from main thread
      const pcm16 = event.data;
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }
      
      // Append to buffer
      const newBuffer = new Float32Array(this.buffer.length + float32.length);
      newBuffer.set(this.buffer);
      newBuffer.set(float32, this.buffer.length);
      this.buffer = newBuffer;
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channelData = output[0];

    if (this.buffer.length >= channelData.length) {
      // We have enough data to fill the buffer
      channelData.set(this.buffer.subarray(0, channelData.length));
      this.buffer = this.buffer.subarray(channelData.length);
    } else {
      // Not enough data, pad with zeros
      channelData.set(this.buffer);
      for (let i = this.buffer.length; i < channelData.length; i++) {
        channelData[i] = 0;
      }
      this.buffer = new Float32Array(0);
    }

    // Mirror to other channels if they exist (stereo)
    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(channelData);
    }

    return true;
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
