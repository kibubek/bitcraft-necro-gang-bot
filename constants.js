const professions = [
    "Carpentry", "Farming", "Fishing", "Foraging", "Forestry",
    "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar",
    "Smithing", "Tailoring", "Cooking"
];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];
const toolsList = [
    "Saw", "Hoe", "Fishing Rod", "Machete", "Axe",
    "Hunting Bow", "Knife", "Chisel", "Pickaxe", "Quill", "Hammer", "Shears"
];
const materials = ["Leather", "Cloth", "Plate"];
const pieces = ["Head", "Chestplate", "Leggings", "Boots", "Gloves", "Belt"];
const tiers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
const rarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];
const professionToolMap = {
    Carpentry: "Saw", Farming: "Hoe", Fishing: "Fishing Rod",
    Foraging: "Machete", Forestry: "Axe", Hunting: "Hunting Bow",
    Leatherworking: "Knife", Masonry: "Chisel", Mining: "Pickaxe",
    Scholar: "Quill", Smithing: "Hammer", Tailoring: "Shears", Cooking: null
};
const validRaritiesForTier = tier => rarities.filter((_, i) => tier >= i + 1);

module.exports = {
    professions,
    levels,
    toolsList,
    materials,
    pieces,
    tiers,
    rarities,
    professionToolMap,
    validRaritiesForTier
};
