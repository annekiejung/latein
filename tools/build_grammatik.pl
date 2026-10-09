#!/usr/bin/perl
# Baut data/grammatik.json aus den Einzeldateien data-src/grammatik/NN-name.json
# (Reihenfolge = Dateiname). Prüft Pflichtfelder grob.
# Danach: perl tools/verify_quellen.pl .cache/texte   (Originalsätze prüfen!)
use strict; use warnings; use JSON::PP;
my $root = do { my $d = __FILE__; $d =~ s{/tools/[^/]+$}{}; $d eq __FILE__ ? '.' : $d };
my @units;
for my $f (sort glob "$root/data-src/grammatik/*.json") {
  open my $fh, '<:raw', $f or die "$f: $!";
  my $u = eval { decode_json(do { local $/; <$fh> }) } or die "Fehler in $f: $@";
  die "$f: id/thema/aufgaben fehlen\n" unless $u->{id} && $u->{thema} && @{ $u->{aufgaben} || [] };
  push @units, $u;
}
my $out = {
  format => 'latein-grammatik-sammlung',
  hinweis => 'Eingebaute Einheiten. Regeln, Aufgaben und Übersetzungen von Claude verfasst. Originalsätze nach The Latin Library (gemeinfreie Texte), Wortlaut dort nachgeprüft; Längenzeichen von Claude ergänzt.',
  einheiten => \@units,
};
open my $o, '>:raw', "$root/data/grammatik.json" or die;
print $o JSON::PP->new->utf8->canonical->encode($out);
close $o;
printf "Gebaut: %d Einheiten (%s)\n", scalar @units, join(', ', map { $_->{thema} } @units);
