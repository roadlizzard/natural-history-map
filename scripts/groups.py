"""The groups of life on the map, and which of them always lived in water or always on land.

One list for every script, so a new group only has to be added here (and in map.js's GROUPS for its label).
"""

GROUPS = ["trilobites", "arthropods", "molluscs", "brachiopods", "bryozoans", "corals-sponges", "echinoderms",
          "graptolites", "conodonts", "forams", "fish", "amphibians", "reptiles", "dinosaurs", "mammals", "plants", "algae",
          "other"]

# Always in water, whatever rock their fossils ended up in.
WATER = {"trilobites", "molluscs", "brachiopods", "bryozoans", "corals-sponges", "echinoderms", "graptolites",
         "conodonts", "forams", "fish", "algae", "other"}
# Always on land (land plants: mosses, ferns, conifers, flowering plants; never sea algae).
LAND = {"dinosaurs", "mammals", "plants", "amphibians"}
# Reptiles and arthropods go wherever their own finds sit (sea reptiles at sea, insects on land).

PHYLUM_GROUP = {"Arthropoda": "arthropods", "Mollusca": "molluscs", "Brachiopoda": "brachiopods",
                "Bryozoa": "bryozoans", "Cnidaria": "corals-sponges", "Porifera": "corals-sponges",
                "Echinodermata": "echinoderms", "Hemichordata": "graptolites",
                # single-celled life with shells: forams, radiolarians, coccoliths, diatoms, dinoflagellates
                "Foraminifera": "forams", "Radiolaria": "forams", "Radiozoa": "forams", "Haptophyta": "forams",
                "Ochrophyta": "forams", "Dinozoa": "forams", "Dinoflagellata": "forams"}
CLASS_GROUP = {
    "Trilobita": "trilobites",
    "Graptolithina": "graptolites", "Pterobranchia": "graptolites",
    # Conodonts were eel-like early vertebrates known almost only from their tiny teeth: not fish.
    "Conodonta": "conodonts",
    "Rhizopodea": "forams",
    "Amphibia": "amphibians",
    "Reptilia": "reptiles", "Ichthyosauria": "reptiles", "Sauropterygia": "reptiles", "Pterosauria": "reptiles",
    "Saurischia": "dinosaurs", "Ornithischia": "dinosaurs", "Aves": "dinosaurs", "Dinosauria": "dinosaurs",
    "Mammalia": "mammals", "Synapsida": "mammals", "Therapsida": "mammals",
}
FISH_CLASSES = {"Osteichthyes", "Actinopterygii", "Sarcopterygii", "Chondrichthyes", "Placodermi", "Acanthodii",
                "Agnatha", "Cephalaspidomorphi", "Pteraspidomorphi", "Pteraspidomorpha", "Thelodonti", "Galeaspida", "Osteostraci",
                "Myxini", "Petromyzontida", "Actinistia", "Dipnoi",
                # jawless fish, and fish PBDB files only as "jawed vertebrates"
                "Cyclostomi", "Anaspida", "Heterostraci", "Arandaspida", "Pituriaspida", "Gnathostomata"}


def group_of(rec, plant_kind=None):
    """rec: a PBDB occurrence (classext). plant_kind: "land" (Embryophyta), "algae" (other Plantae) or None."""
    if plant_kind == "land":
        return "plants"
    if plant_kind == "algae":
        return "algae"
    cls, phylum = rec.get("cll", ""), rec.get("phl", "")
    if cls in CLASS_GROUP:
        return CLASS_GROUP[cls]
    if cls in FISH_CLASSES:
        return "fish"
    return PHYLUM_GROUP.get(phylum, "other")
