import {
  ItemListed,
  ItemCancelled,
  ItemBought,
} from "../generated/NFTMarketplace/NFTMarketplace";
import { Listing } from "../generated/schema";

export function handleItemListed(event: ItemListed): void {
  const listing = new Listing(
    event.params.NFTAddress.toHex() + "-" + event.params.tokenId.toString()
  );
  listing.NFTAddress = event.params.NFTAddress;
  listing.tokenId = event.params.tokenId;
  listing.price = event.params.price;
  listing.seller = event.params.seller;
  listing.status = 0;
  listing.save();
}

export function handleItemCancelled(event: ItemCancelled): void {
  const listing = Listing.load(
    event.params.NFTAddress.toHex() + "-" + event.params.tokenId.toString()
  );
  if (listing) {
    listing.status = 1;
    listing.save();
  }
}

export function handleItemBought(event: ItemBought): void {
  const listing = Listing.load(
    event.params.NFTAddress.toHex() + "-" + event.params.tokenId.toString()
  );
  if (listing) {
    listing.status = 2;
    listing.buyer = event.params.buyer;
    listing.save();
  }
}
