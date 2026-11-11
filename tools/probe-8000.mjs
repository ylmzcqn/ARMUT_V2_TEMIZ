import net from 'node:net';

const client = new net.Socket();
client.setTimeout(3000);

console.log('192.168.1.103:8000 bağlanılıyor...');
client.connect(8000, '192.168.1.103', () => {
  console.log('Bağlandı! Veri bekleniyor veya "hello\\n" gönderiliyor...');
  client.write('GET / HTTP/1.1\r\nHost: 192.168.1.103:8000\r\n\r\n');
});

client.on('data', (data) => {
  console.log(`Veri alındı (${data.length} bayt):`);
  console.log(data.toString('utf8'));
  console.log('Hex:', data.toString('hex').slice(0, 100));
  client.destroy();
});

client.on('error', (err) => {
  console.log('Hata:', err.message);
});

client.on('timeout', () => {
  console.log('Zaman aşımı');
  client.destroy();
});

client.on('close', () => {
  console.log('Bağlantı kapandı.');
});
