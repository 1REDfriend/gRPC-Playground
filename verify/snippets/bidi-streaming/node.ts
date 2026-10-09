// Server: call is a Duplex stream
server.addService(shop.OrderService.service, {
  supportChat(call: grpc.ServerDuplexStream<any, any>) {
    call.write({ from: 'bot', text: 'Hi! How can I help?' });
    call.on('data', (msg: any) => {
      for (const reply of bot.answer(msg.text)) call.write({ from: 'bot', text: reply });
    });
    call.on('end', () => {
      call.write({ from: 'bot', text: 'Have a nice day!' });
      call.end();
    });
  },
});

// Client
const chat = client.supportChat();
chat.on('data', (m: any) => console.log(`${m.from}: ${m.text}`));
chat.on('end', () => console.log('chat closed'));

chat.write({ from: 'C-42', text: 'Where is order A-1001?' });
setTimeout(() => {
  chat.write({ from: 'C-42', text: 'Thanks!' });
  chat.end(); // half-close
}, 2000);
