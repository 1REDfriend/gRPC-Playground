import (
	"log"

	"google.golang.org/protobuf/proto"

	shopv1 "example.com/shop/gen/shopv1"
)

func roundTrip() {
	item := &shopv1.Item{Sku: "SKU-1007", Quantity: 150}

	data, err := proto.Marshal(item) // []byte, 13 bytes
	if err != nil {
		log.Fatal(err)
	}

	var decoded shopv1.Item
	if err := proto.Unmarshal(data, &decoded); err != nil {
		log.Fatal(err)
	}
	log.Printf("%x -> %s x%d", data, decoded.GetSku(), decoded.GetQuantity())
}
